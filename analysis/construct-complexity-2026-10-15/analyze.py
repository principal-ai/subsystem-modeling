"""Analyze saved Jev scores using only Python's standard library."""
import csv
import html
import json
import math
import random
import statistics
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent


def pearson(xs, ys):
    if len(xs) < 3:
        return None
    mx, my = statistics.mean(xs), statistics.mean(ys)
    numerator = sum((x - mx) * (y - my) for x, y in zip(xs, ys))
    denom = math.sqrt(sum((x - mx) ** 2 for x in xs) * sum((y - my) ** 2 for y in ys))
    return numerator / denom if denom else None


def ranks(values):
    ordered = sorted(range(len(values)), key=values.__getitem__)
    result = [0.0] * len(values)
    start = 0
    while start < len(ordered):
        end = start + 1
        while end < len(ordered) and values[ordered[end]] == values[ordered[start]]:
            end += 1
        for i in range(start, end):
            result[ordered[i]] = (start + end - 1) / 2 + 1
        start = end
    return result


def spearman(xs, ys):
    return pearson(ranks(xs), ranks(ys))


def quantile(xs, q):
    xs = sorted(xs)
    pos = (len(xs) - 1) * q
    lo = int(pos)
    return xs[lo] + (xs[min(lo + 1, len(xs) - 1)] - xs[lo]) * (pos - lo)


def cluster_ci(rows, metric, repetitions=1500):
    # Resample whole files rather than pretend nested/sibling spans are independent.
    groups = defaultdict(list)
    for row in rows:
        groups[(row["repo"], row["file"])].append(row)
    if len(groups) < 5:
        return None
    clusters = list(groups.values())
    rng = random.Random(20261015)
    estimates = []
    for _ in range(repetitions):
        sample = [row for _ in clusters for row in rng.choice(clusters)]
        value = spearman([r[metric] for r in sample], [r["score100"] for r in sample])
        if value is not None:
            estimates.append(value)
    return [quantile(estimates, 0.025), quantile(estimates, 0.975)]


def regression(rows):
    if len(rows) < 3:
        return None
    xs = [math.log2(r["nonblankLines"]) for r in rows]
    ys = [r["score100"] for r in rows]
    mx, my = statistics.mean(xs), statistics.mean(ys)
    ssx = sum((x - mx) ** 2 for x in xs)
    if not ssx:
        return None
    slope = sum((x - mx) * (y - my) for x, y in zip(xs, ys)) / ssx
    intercept = my - slope * mx
    residuals = [y - (intercept + slope * x) for x, y in zip(xs, ys)]
    sst = sum((y - my) ** 2 for y in ys)
    return {
        "scorePointsPerDoublingOfNonblankLines": slope,
        "intercept": intercept,
        "rSquared": 1 - sum(e ** 2 for e in residuals) / sst if sst else None,
        "residualRmse": math.sqrt(statistics.mean(e ** 2 for e in residuals)),
    }


def describe(rows, bootstrap=False):
    summary = {
        "n": len(rows),
        "files": len({(r["repo"], r["file"]) for r in rows}),
        "constructKinds": dict(Counter(r["construct"] for r in rows)),
    }
    if not rows:
        return summary
    summary.update({
        "medianTotalLines": statistics.median(r["totalLines"] for r in rows),
        "medianNonblankLines": statistics.median(r["nonblankLines"] for r in rows),
        "medianScore100": statistics.median(r["score100"] for r in rows),
        "scoreRange": [min(r["score100"] for r in rows), max(r["score100"] for r in rows)],
        "correlations": {},
        "logLengthRegression": regression(rows),
    })
    for metric in ("totalLines", "nonblankLines", "characters", "words"):
        xs, ys = [r[metric] for r in rows], [r["score100"] for r in rows]
        summary["correlations"][metric] = {
            "pearson": pearson(xs, ys),
            "spearman": spearman(xs, ys),
            "pearsonLog2Length": pearson([math.log2(x) for x in xs], ys),
        }
        if bootstrap and metric in ("totalLines", "nonblankLines"):
            summary["correlations"][metric]["spearmanFileCluster95CI"] = cluster_ci(rows, metric)
    return summary


def main():
    inventory = json.loads((ROOT / "inventory.json").read_text())
    latest = {}
    for line in (ROOT / "results.jsonl").read_text().splitlines():
        row = json.loads(line)
        if row.get("rubricHash") == inventory["rubricHash"]:
            latest[row["key"]] = row
    rows = [r for r in latest.values() if r["ok"]]
    for row in rows:
        row["score100"] = row["result"]["score"] * 100
    assert len(rows) == inventory["uniqueSpans"], "Incomplete scoring; do not report a complete census."
    assert all(r["totalLines"] == r["endLine"] - r["startLine"] + 1 for r in rows)
    assert all(0 <= r["score100"] <= 100 and r["nonblankLines"] > 0 for r in rows)
    executable = [r for r in rows if r["construct"] in ("function", "method")]
    leaf = [
        r for r in rows if not any(
            s["key"] != r["key"] and (s["repo"], s["file"]) == (r["repo"], r["file"])
            and s["startLine"] >= r["startLine"] and s["endLine"] <= r["endLine"]
            and (s["startLine"], s["endLine"]) != (r["startLine"], r["endLine"])
            for s in rows
        )
    ]
    kinds = sorted({r["construct"] for r in rows})
    repo_counts = Counter(r["repo"] for r in rows)
    summary = {
        "claims": inventory["claims"], "uniqueSpans": len(rows),
        "duplicateClaimsRemoved": inventory["claims"] - len(rows),
        "actualModels": dict(Counter(r.get("responseModel", "unknown") for r in rows)),
        "rubricHash": inventory["rubricHash"],
        "all": describe(rows, True),
        "executable": describe(executable, True),
        "leafSpans": describe(leaf, True),
        "byKind": {kind: describe([r for r in rows if r["construct"] == kind]) for kind in kinds},
        "byRepo": {repo: describe([r for r in rows if r["repo"] == repo]) for repo in repo_counts},
        "lowConfidenceCount": sum(r["result"].get("confidence", 0) < 0.5 for r in rows),
        "medianConfidence": statistics.median(r["result"].get("confidence", 0) for r in rows),
        "tokenUsage": {
            key: sum((r.get("usage") or {}).get(key, 0) for r in rows)
            for key in ("input_tokens", "output_tokens")
        },
        "bins": [],
    }
    for lo, hi in [(1, 10), (11, 25), (26, 50), (51, 100), (101, 200), (201, 100000)]:
        subset = [r for r in rows if lo <= r["nonblankLines"] <= hi]
        if subset:
            summary["bins"].append({
                "nonblankLines": f"{lo}–{hi}" if hi < 100000 else "201+",
                "n": len(subset), "medianScore100": statistics.median(r["score100"] for r in subset),
                "scoreQuartiles": [quantile([r["score100"] for r in subset], q) for q in (0.25, 0.75)],
            })
    # Center within kinds to check that between-kind differences do not explain everything.
    within_x, within_y = [], []
    for kind in kinds:
        subset = [r for r in rows if r["construct"] == kind]
        if len(subset) < 3:
            continue
        xs, ys = [math.log2(r["nonblankLines"]) for r in subset], [r["score100"] for r in subset]
        within_x.extend(x - statistics.mean(xs) for x in xs)
        within_y.extend(y - statistics.mean(ys) for y in ys)
    summary["withinKindLogLengthPearson"] = pearson(within_x, within_y)
    fit = regression(executable)
    residual_rows = []
    if fit:
        for r in executable:
            predicted = fit["intercept"] + fit["scorePointsPerDoublingOfNonblankLines"] * math.log2(r["nonblankLines"])
            residual_rows.append({
                key: r[key] for key in ("repo", "file", "symbol", "construct", "nonblankLines", "score100")
            } | {"predictedScore100": predicted, "residualScorePoints": r["score100"] - predicted})
    summary["moreComplexThanLengthPredicts"] = sorted(residual_rows, key=lambda r: -r["residualScorePoints"])[:8]
    summary["lessComplexThanLengthPredicts"] = sorted(residual_rows, key=lambda r: r["residualScorePoints"])[:8]
    (ROOT / "summary.json").write_text(json.dumps(summary, indent=2) + "\n")
    fields = ["repo", "file", "symbol", "construct", "startLine", "endLine", "totalLines", "nonblankLines", "characters", "words", "score100", "rawScore", "confidence", "model"]
    with (ROOT / "constructs.csv").open("w", newline="") as file:
        writer = csv.DictWriter(file, fieldnames=fields, lineterminator="\n")
        writer.writeheader()
        for r in sorted(rows, key=lambda r: (r["repo"], r["file"], r["startLine"])):
            writer.writerow({
                key: r.get(key, r["result"].get(key)) for key in fields
            } | {"model": r.get("responseModel", r["result"]["model"])})
    draw(rows, summary)
    print(json.dumps(summary, indent=2))


def draw(rows, summary):
    width, height = 1000, 650
    left, top, plot_w, plot_h = 80, 90, 860, 440
    xmax = math.ceil(math.log2(max(r["nonblankLines"] for r in rows)))
    x = lambda n: left + math.log2(n) / xmax * plot_w
    y = lambda score: top + (1 - score / 100) * plot_h
    palette = {"function": "#2563eb", "method": "#7c3aed", "class": "#ea580c", "interface": "#0891b2", "type_alias": "#059669", "enum": "#64748b"}
    elements = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}">',
        '<rect width="100%" height="100%" fill="white"/>',
        '<g font-family="Arial, sans-serif" fill="#0f172a">',
        '<text x="80" y="32" font-size="23" font-weight="bold">Does Jev complexity mostly track construct length?</text>',
        f'<text x="80" y="58" font-size="15">{len(rows)} unique verified spans · Spearman ρ = {summary["all"]["correlations"]["nonblankLines"]["spearman"]:.2f} · one score per span</text>',
    ]
    for tick in range(0, 101, 20):
        elements.extend([
            f'<line x1="{left}" y1="{y(tick)}" x2="{left+plot_w}" y2="{y(tick)}" stroke="#e2e8f0"/>',
            f'<text x="{left-12}" y="{y(tick)+5}" text-anchor="end" font-size="13">{tick}</text>',
        ])
    for power in range(xmax + 1):
        val = 2 ** power
        elements.extend([
            f'<line x1="{x(val)}" y1="{top}" x2="{x(val)}" y2="{top+plot_h}" stroke="#f1f5f9"/>',
            f'<text x="{x(val)}" y="{top+plot_h+24}" text-anchor="middle" font-size="13">{val}</text>',
        ])
    fit = summary["all"]["logLengthRegression"]
    elements.append(f'<defs><clipPath id="plot"><rect x="{left}" y="{top}" width="{plot_w}" height="{plot_h}"/></clipPath></defs>')
    elements.append(f'<line clip-path="url(#plot)" x1="{x(1)}" y1="{y(fit["intercept"])}" x2="{x(2**xmax)}" y2="{y(fit["intercept"]+fit["scorePointsPerDoublingOfNonblankLines"]*xmax)}" stroke="#475569" stroke-dasharray="6,5" opacity="0.65"/>')
    for row in rows:
        label = html.escape(f'{row["symbol"]} | {row["nonblankLines"]} nonblank lines | {row["score100"]:.1f}/100 | {row["file"]}:{row["startLine"]}')
        elements.append(f'<circle cx="{x(row["nonblankLines"]):.2f}" cy="{y(row["score100"]):.2f}" r="4.5" fill="{palette.get(row["construct"], "#64748b")}" opacity="0.7"><title>{label}</title></circle>')
    elements.extend([
        '<text x="510" y="585" text-anchor="middle" font-size="15">Nonblank lines (log₂ scale: each step doubles length)</text>',
        '<text transform="translate(22 310) rotate(-90)" text-anchor="middle" font-size="15">Jev estimated complexity (0–100)</text>',
    ])
    for i, kind in enumerate(sorted({r["construct"] for r in rows})):
        xpos = 85 + i * 145
        elements.append(f'<circle cx="{xpos}" cy="622" r="5" fill="{palette.get(kind, "#64748b")}"/><text x="{xpos+12}" y="627" font-size="14">{kind}</text>')
    elements.append("</g></svg>")
    (ROOT / "length-vs-complexity.svg").write_text("\n".join(elements))


if __name__ == "__main__":
    main()
