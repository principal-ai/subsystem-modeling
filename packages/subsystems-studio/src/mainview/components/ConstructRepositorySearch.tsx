import { useEffect, useState } from "react";
import { useTheme } from "@principal-ade/industry-theme";
import { Search, X } from "lucide-react";
import type { ConstructInventoryRepo } from "../../shared/contract";
import { electrobun } from "../rpc";

export function ConstructRepositorySearch({
	onSelect,
}: {
	onSelect: (repo: ConstructInventoryRepo) => void;
}) {
	const { theme } = useTheme();
	const muted = theme.colors.textMuted ?? theme.colors.textSecondary;
	const [query, setQuery] = useState("");
	const [results, setResults] = useState<ConstructInventoryRepo[]>([]);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const q = query.trim();

	useEffect(() => {
		if (!q) {
			setResults([]);
			setLoading(false);
			setError(null);
			return;
		}
		let cancelled = false;
		setLoading(true);
		setResults([]);
		setError(null);
		const timer = setTimeout(async () => {
			try {
				const response = await electrobun.rpc!.request.searchConstructRepositories({ query: q });
				if (cancelled) return;
				if (!response.ok) throw new Error(response.error ?? "Could not search the Alexandria registry.");
				setResults(response.repos);
			} catch (err) {
				if (!cancelled) setError(err instanceof Error ? err.message : String(err));
			} finally {
				if (!cancelled) setLoading(false);
			}
		}, 200);
		return () => { cancelled = true; clearTimeout(timer); };
	}, [q]);

	return (
		<div style={{ flexShrink: 0, borderBottom: `1px solid ${theme.colors.border}`, fontSize: theme.fontSizes[1] }}>
			<label style={{ display: "flex", alignItems: "center", gap: 6, margin: "10px 12px", padding: "6px 9px",
				border: `1px solid ${theme.colors.border}`, borderRadius: 6 }}>
				<Search size={14} color={muted} aria-hidden="true" />
				<input
					type="search"
					aria-label="Search Alexandria registry"
					placeholder="Search Alexandria registry…"
					value={query}
					onChange={(event) => setQuery(event.target.value)}
					onKeyDown={(event) => {
						if (event.key === "Escape") setQuery("");
						if (event.key === "Enter" && !loading && results[0]) {
							event.preventDefault();
							onSelect(results[0]);
							setQuery("");
						}
					}}
					autoComplete="off"
					spellCheck={false}
					style={{ flex: 1, minWidth: 0, border: "none", outline: "none", background: "transparent",
						color: theme.colors.text, fontFamily: theme.fonts.body, fontSize: theme.fontSizes[1] }}
				/>
				{query && <button type="button" aria-label="Clear registry search" onClick={() => setQuery("")}
					style={{ display: "flex", padding: 0, border: "none", background: "transparent", color: muted, cursor: "pointer" }}>
					<X size={14} />
				</button>}
			</label>
			{q && <div aria-label="Alexandria search results" aria-busy={loading} style={{ maxHeight: 280, overflowY: "auto" }}>
				{loading || error || results.length === 0 ? (
					<div role={error ? "alert" : "status"} style={{ padding: "0 12px 10px", color: muted }}>
						{loading ? "Searching…" : error ?? "No registered repositories match."}
					</div>
				) : results.map((repo) => (
					<button key={repo.repoKey} type="button" onClick={() => { onSelect(repo); setQuery(""); }}
						style={{ display: "block", width: "100%", padding: "8px 12px", border: "none",
							textAlign: "left", background: "transparent", color: theme.colors.text,
							fontFamily: theme.fonts.body, fontSize: theme.fontSizes[1], cursor: "pointer",
							overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
						title={`${repo.owner}/${repo.name}`}>
						{repo.owner}/{repo.name}
					</button>
				))}
			</div>}
		</div>
	);
}
