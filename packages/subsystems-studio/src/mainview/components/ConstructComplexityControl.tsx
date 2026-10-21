import { useEffect, useRef, useState } from "react";
import { useTheme } from "@principal-ade/industry-theme";
import { Loader2 } from "lucide-react";
import type { ConstructComplexity, VerifiedConstruct } from "../../shared/contract";
import { electrobun } from "../rpc";

/** An estimate, not a static-analysis metric or a measure of importance. */
export function ComplexityBadge({ result }: { result: ConstructComplexity }) {
	const value = Math.round(result.score * 100);
	const color = `hsl(${120 * (1 - result.score)}, 65%, 45%)`;
	return (
		<span
			role="meter"
			aria-label="Jev estimated complexity"
			aria-valuemin={0}
			aria-valuemax={100}
			aria-valuenow={value}
			aria-valuetext={`${value} out of 100, lower is simpler`}
			title={[
				"AI estimate: 0 = simple, 100 = complex. Not a static-analysis metric.",
				`Model: ${result.model}`,
				...(result.confidence == null ? [] : [`Confidence: ${Math.round(result.confidence * 100)}%`]),
			].join("\n")}
			style={{
				flexShrink: 0,
				fontWeight: 600,
				padding: "3px 9px",
				borderRadius: 999,
				color,
				background: `hsl(${120 * (1 - result.score)} 65% 45% / 0.12)`,
				border: `1px solid ${color}`,
			}}
		>
			AI complexity {value}/100
		</span>
	);
}

export function ConstructComplexityControl({
	construct,
	enabled,
}: {
	construct: Pick<VerifiedConstruct, "purl" | "file" | "startLine" | "endLine" | "contentHash">;
	enabled: boolean;
}) {
	const { theme } = useTheme();
	const [result, setResult] = useState<ConstructComplexity | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);
	const pending = useRef(false);
	const mounted = useRef(true);
	useEffect(() => {
		mounted.current = true;
		return () => { mounted.current = false; };
	}, []);

	async function assess() {
		if (!enabled || pending.current) return;
		pending.current = true;
		setLoading(true);
		setError(null);
		setResult(null);
		try {
			const response = await electrobun.rpc!.request.assessConstructComplexity({
				purl: construct.purl,
				file: construct.file,
				startLine: construct.startLine,
				endLine: construct.endLine,
				contentHash: construct.contentHash,
			});
			if (!mounted.current) return;
			if (response.ok && response.result && response.result.contentHash === construct.contentHash) {
				setResult(response.result);
			} else {
				setError(response.error ?? "Unable to assess this construct.");
			}
		} catch {
			if (mounted.current) setError("Complexity request failed. Please retry.");
		} finally {
			pending.current = false;
			if (mounted.current) setLoading(false);
		}
	}

	return (
		<div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
			<div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: theme.fontSizes[1] }}>
				<span role="status">{enabled && result && <ComplexityBadge result={result} />}</span>
				<button
					type="button"
					disabled={!enabled || loading}
					onClick={() => void assess()}
					title={enabled
						? "Send this construct's source to Jev (TypeSafe AI) for a complexity estimate: 0 = simple, 100 = complex."
						: "A freshly verified source span is required to assess complexity."}
					style={{
						display: "flex",
						alignItems: "center",
						gap: 6,
						padding: "4px 9px",
						borderRadius: 5,
						border: `1px solid ${theme.colors.border ?? "#333"}`,
						background: theme.colors.background,
						color: theme.colors.text,
						fontFamily: theme.fonts.body,
						fontSize: theme.fontSizes[1],
						whiteSpace: "nowrap",
						cursor: enabled && !loading ? "pointer" : "not-allowed",
						opacity: enabled && !loading ? 1 : 0.55,
					}}
				>
					{loading && <Loader2 size={14} className="principal-studio-spin" />}
					{loading ? "Assessing…" : result ? "Reassess complexity" : "Assess complexity"}
				</button>
			</div>
			{error && (
				<span role="alert" style={{ color: "#e5534b", fontSize: theme.fontSizes[1], maxWidth: 420 }}>
					{error}
				</span>
			)}
		</div>
	);
}
