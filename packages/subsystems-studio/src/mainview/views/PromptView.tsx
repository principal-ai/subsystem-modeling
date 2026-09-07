/**
 * PromptView — renders a `kind: "prompt"` tab: the verbatim system prompt and
 * task template given to the concept-extractor agent. This is the audit surface
 * for "what was the agent asked?" — the text the analysis cards come from.
 *
 * The payload is `ExtractionPromptInfo`, served host-side by `fullState` from
 * `getExtractionPromptInfo()` (reads the agent file from disk).
 */

import { useEffect, useState } from "react";
import { useTheme } from "@principal-ade/industry-theme";
import { electrobun } from "../rpc";
import { CenteredMessage } from "../ui";
import type { ExtractionPromptInfo } from "../../shared/contract";

export function PromptView({ tabId }: { tabId: string }) {
	const { theme } = useTheme();
	const [info, setInfo] = useState<ExtractionPromptInfo | null | undefined>(
		undefined,
	);

	useEffect(() => {
		let cancelled = false;
		(async () => {
			try {
				const tab = await electrobun.rpc!.request.getTab({ id: tabId });
				if (cancelled) return;
				setInfo(
					tab.ok && tab.payload
						? (tab.payload as ExtractionPromptInfo)
						: null,
				);
			} catch {
				if (cancelled) return;
				setInfo(null);
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [tabId]);

	if (info === undefined) {
		return <CenteredMessage title="Loading prompt…" />;
	}
	if (info === null) {
		return (
			<CenteredMessage
				title="Prompt unavailable"
				detail="Could not load the extractor prompt from the host."
			/>
		);
	}

	const mono: React.CSSProperties = {
		fontFamily: theme.fonts.monospace,
		fontSize: theme.fontSizes[0],
		lineHeight: 1.55,
		color: theme.colors.text,
		background: theme.colors.backgroundSecondary ?? "#101218",
		border: `1px solid ${theme.colors.border ?? "#333"}`,
		borderRadius: 6,
		padding: "14px 16px",
		whiteSpace: "pre-wrap",
		wordBreak: "break-word",
		overflowX: "auto",
		margin: 0,
	};

	return (
		<div
			style={{
				flex: 1,
				minHeight: 0,
				display: "flex",
				flexDirection: "column",
				background: theme.colors.background,
			}}
		>
			<div
				style={{
					padding: "14px 24px",
					borderBottom: `1px solid ${theme.colors.border ?? "#333"}`,
					display: "flex",
					alignItems: "center",
					justifyContent: "space-between",
					gap: 16,
					flexShrink: 0,
				}}
			>
				<div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
					<span
						style={{
							fontSize: theme.fontSizes[3],
							fontFamily: theme.fonts.heading ?? theme.fonts.body,
							color: theme.colors.text,
							lineHeight: 1.3,
						}}
					>
						Extractor prompt
					</span>
					<span
						style={{
							fontSize: theme.fontSizes[0],
							color: theme.colors.textSecondary,
							fontFamily: theme.fonts.monospace,
						}}
					>
						{info.agent} · {info.model}
					</span>
				</div>
			</div>

			<div
				style={{
					flex: 1,
					minHeight: 0,
					overflowY: "auto",
					padding: "20px 24px 40px",
				}}
			>
				<div
					style={{
						display: "grid",
						gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
						gap: 20,
						maxWidth: 1240,
						margin: "0 auto",
					}}
				>
				<section style={{ display: "flex", flexDirection: "column", gap: 6 }}>
					<span
						style={{
							fontSize: theme.fontSizes[1],
							fontFamily: theme.fonts.heading ?? theme.fonts.body,
							color: theme.colors.text,
						}}
					>
						System prompt
					</span>
					<span
						style={{
							fontSize: theme.fontSizes[0],
							color: theme.colors.textMuted,
							fontFamily: theme.fonts.monospace,
						}}
					>
						read from {info.agentPath}
					</span>
					<pre style={{ ...mono, flex: 1 }}>{info.systemPrompt}</pre>
				</section>

				<section style={{ display: "flex", flexDirection: "column", gap: 6 }}>
					<span
						style={{
							fontSize: theme.fontSizes[1],
							fontFamily: theme.fonts.heading ?? theme.fonts.body,
							color: theme.colors.text,
						}}
					>
						Task message
					</span>
					<span
						style={{
							fontSize: theme.fontSizes[0],
							color: theme.colors.textMuted,
							fontFamily: theme.fonts.body,
						}}
					>
						Per run — title interpolated
					</span>
					<pre style={{ ...mono, flex: 1 }}>{info.taskTemplate}</pre>
				</section>
				</div>
			</div>
		</div>
	);
}
