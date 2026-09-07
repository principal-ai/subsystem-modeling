/**
 * SubsystemSnapshots — renders the subsystem snapshots an analysis produced.
 *
 * The component graph is **central** (the stable substrate — kind-tagged
 * components, package subgraphs); the sequence story is behind a toggle (the
 * per-capture execution narrative); the important types/files/tests round out
 * the facets. One card per subsystem — a session may cover several.
 */

import { useState } from "react";
import { useTheme } from "@principal-ade/industry-theme";
import { IndustryLazyMermaidDiagram } from "themed-markdown";
import { electrobun } from "../rpc";
import type { SubsystemSnapshot } from "../../shared/contract";

function openPurl(purl: string): void {
	void electrobun.rpc!.request.openFile({ purl }).catch(() => {});
}

function fileLabel(purl: string): string {
	return purl.split("#")[1] ?? purl;
}

export function SubsystemSnapshots({
	subsystems,
}: {
	subsystems: SubsystemSnapshot[];
}) {
	const { theme } = useTheme();

	if (subsystems.length === 0) {
		return (
			<div
				style={{
					flex: 1,
					display: "flex",
					alignItems: "center",
					justifyContent: "center",
					color: theme.colors.textMuted,
					fontSize: theme.fontSizes[2],
				}}
			>
				No subsystem snapshots captured for this session.
			</div>
		);
	}

	return (
		<div
			style={{
				flex: 1,
				minHeight: 0,
				overflowY: "auto",
				display: "flex",
				flexDirection: "column",
				alignItems: "center",
				gap: 20,
				padding: "20px 24px 40px",
			}}
		>
			{subsystems.map((s) => (
				<SubsystemCard key={s.id} subsystem={s} />
			))}
		</div>
	);
}

function SubsystemCard({ subsystem: s }: { subsystem: SubsystemSnapshot }) {
	const { theme } = useTheme();
	const [showDetails, setShowDetails] = useState(false);
	const muted = theme.colors.textMuted ?? theme.colors.textSecondary;

	return (
		<div
			style={{
				display: "flex",
				flexDirection: "column",
				width: "100%",
				maxWidth: 760,
				flexShrink: 0,
				border: `1px solid ${theme.colors.border ?? "#333"}`,
				borderRadius: theme.radii?.[2] ?? 12,
				overflow: "hidden",
				background: theme.colors.backgroundSecondary ?? theme.colors.background,
			}}
		>
			{/* Header */}
			<div
				style={{
					display: "flex",
					flexDirection: "column",
					gap: 6,
					padding: "14px 20px",
					borderBottom: `1px solid ${theme.colors.border ?? "#333"}`,
					background: theme.colors.background,
				}}
			>
				<div
					style={{
						display: "flex",
						alignItems: "baseline",
						justifyContent: "space-between",
						gap: 12,
					}}
				>
					<span
						style={{
							fontSize: theme.fontSizes[3],
							fontFamily: theme.fonts.heading ?? theme.fonts.body,
							color: theme.colors.text,
							lineHeight: 1.3,
						}}
					>
						{s.name}
					</span>
					{s.repo && (
						<span
							style={{
								fontSize: theme.fontSizes[0],
								fontFamily: theme.fonts.monospace,
								color: muted,
								whiteSpace: "nowrap",
								flexShrink: 0,
							}}
						>
							{s.repo.owner}/{s.repo.name}
						</span>
					)}
				</div>
				{s.description && (
					<span style={{ fontSize: theme.fontSizes[1], color: muted, lineHeight: 1.5 }}>
						{s.description}
					</span>
				)}
			</div>

			{/* Central: the component graph (stable substrate) */}
			{s.graphMermaid && (
				<div
					style={{
						display: "flex",
						alignItems: "center",
						justifyContent: "center",
						minHeight: 280,
						padding: "12px 20px",
						borderBottom: `1px solid ${theme.colors.border ?? "#333"}`,
						background: theme.colors.background,
					}}
				>
					<IndustryLazyMermaidDiagram
						code={s.graphMermaid}
						id={`subsystem-${s.id}-graph`}
						theme={theme}
						maxHeight="calc(100vh - 480px)"
						showChrome={false}
					/>
				</div>
			)}

			{/* Toggles */}
			<div
				style={{
					display: "flex",
					alignItems: "center",
					gap: 12,
					padding: "10px 20px",
					borderBottom: `1px solid ${theme.colors.border ?? "#333"}`,
				}}
			>
				{(() => {
					const toggles: { key: string; label: string }[] = [];
					toggles.push({ key: "details", label: "Types · files · tests" });
					return toggles;
				})().map((t) => {
					const active = showDetails;
					return (
						<button
							key={t.key}
							type="button"
							onClick={() => setShowDetails((v) => !v)}
							style={{
								padding: "3px 10px",
								borderRadius: 6,
								border: `1px solid ${theme.colors.border ?? "#333"}`,
								background: active
									? theme.colors.background
									: theme.colors.backgroundSecondary,
								color: active ? theme.colors.text : theme.colors.textSecondary,
								fontSize: theme.fontSizes[1],
								fontFamily: theme.fonts.monospace,
								cursor: "pointer",
							}}
						>
							{t.label}
						</button>
					);
				})}
				<span style={{ flex: 1 }} />
				<span
					style={{
						fontSize: theme.fontSizes[0],
						fontFamily: theme.fonts.monospace,
						color: muted,
					}}
				>
					{s.entryPoints.length} entry pts · {s.files.length} files ·{" "}
					{s.integrations.length} edges
				</span>
			</div>

			{/* Details */}
			{showDetails && (
				<div
					style={{
						display: "flex",
						flexDirection: "column",
						gap: 16,
						padding: "14px 20px",
					}}
				>
					{s.entryPoints.length > 0 && (
						<Section title="Important types">
							{s.entryPoints.map((ep) => (
								<div
									key={`${ep.file}#${ep.symbol}`}
									style={{
										display: "flex",
										flexDirection: "column",
										gap: 2,
										padding: "8px 10px",
										marginBottom: 6,
										borderRadius: 6,
										background: theme.colors.background,
										border: `1px solid ${theme.colors.border ?? "#333"}`,
									}}
								>
									<div
										style={{
											display: "flex",
											alignItems: "center",
											gap: 8,
											flexWrap: "wrap",
										}}
									>
										<span
											style={{
												fontFamily: theme.fonts.monospace,
												fontSize: theme.fontSizes[2],
												color: theme.colors.text,
											}}
										>
											{ep.symbol}
										</span>
										<span
											style={{
												fontSize: theme.fontSizes[0],
												fontFamily: theme.fonts.monospace,
												textTransform: "uppercase",
												letterSpacing: 0.5,
												color: theme.colors.primary,
											}}
										>
											{ep.kind}
										</span>
										<span
											role="button"
											tabIndex={0}
											onClick={(e) => {
												e.stopPropagation();
												openPurl(ep.file);
											}}
											onKeyDown={(e) => {
												if (e.key === "Enter" || e.key === " ") {
													e.preventDefault();
													openPurl(ep.file);
												}
											}}
											style={{
												fontFamily: theme.fonts.monospace,
												fontSize: theme.fontSizes[0],
												color: muted,
												cursor: "pointer",
												border: `1px solid ${theme.colors.border ?? "#333"}`,
												borderRadius: 4,
												padding: "1px 6px",
											}}
											title={ep.file}
										>
											{fileLabel(ep.file)}
											{ep.line ? `:${ep.line}` : ""}
										</span>
									</div>
									{ep.signature && (
										<span
											style={{
												fontFamily: theme.fonts.monospace,
												fontSize: theme.fontSizes[0],
												color: muted,
												whiteSpace: "nowrap",
												overflow: "hidden",
												textOverflow: "ellipsis",
											}}
										>
											{ep.signature}
										</span>
									)}
								</div>
							))}
						</Section>
					)}

					{s.files.length > 0 && (
						<Section title="Files">
							<div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
								{s.files.map((f) => (
									<span
										key={f.purl}
										role="button"
										tabIndex={0}
										onClick={(e) => {
											e.stopPropagation();
											openPurl(f.purl);
										}}
										onKeyDown={(e) => {
											if (e.key === "Enter" || e.key === " ") {
												e.preventDefault();
												openPurl(f.purl);
											}
										}}
										style={{
											display: "inline-flex",
											alignItems: "center",
											gap: 6,
											padding: "2px 8px",
											borderRadius: 4,
											border: `1px solid ${theme.colors.border ?? "#333"}`,
											background: theme.colors.background,
											color: theme.colors.textSecondary,
											fontFamily: theme.fonts.monospace,
											fontSize: theme.fontSizes[0],
											cursor: "pointer",
										}}
										title={f.purl}
									>
										{f.role === "core" && (
											<span style={{ color: theme.colors.primary }}>◆</span>
										)}
										{fileLabel(f.purl)}
									</span>
								))}
							</div>
						</Section>
					)}

					{s.integrations.length > 0 && (
						<Section title="Integration edges">
							{s.integrations.map((it, i) => (
								<div
									key={i}
									style={{
										display: "flex",
										alignItems: "baseline",
										gap: 8,
										fontFamily: theme.fonts.monospace,
										fontSize: theme.fontSizes[0],
										marginBottom: 4,
										flexWrap: "wrap",
									}}
								>
									<span style={{ color: theme.colors.primary }}>
										{it.mechanism}
									</span>
									<span style={{ color: theme.colors.text }}>→ {it.to}</span>
									{it.refs.length > 0 && (
										<span style={{ color: muted }}>
											({it.refs.map((r) => fileLabel(r)).join(", ")})
										</span>
									)}
								</div>
							))}
						</Section>
					)}

					{(s.fixtures.length > 0 || s.testSuites.length > 0) && (
						<Section title="How it's tested">
							{s.fixtures.length > 0 && (
								<div style={{ marginBottom: 8 }}>
									<span
										style={{
											fontSize: theme.fontSizes[0],
											textTransform: "uppercase",
											letterSpacing: 0.5,
											color: muted,
											marginRight: 8,
										}}
									>
										Fixtures
									</span>
									{s.fixtures.map((f) => (
										<span
											key={f}
											role="button"
											tabIndex={0}
											onClick={(e) => {
												e.stopPropagation();
												openPurl(f);
											}}
											onKeyDown={(e) => {
												if (e.key === "Enter" || e.key === " ") {
													e.preventDefault();
													openPurl(f);
												}
											}}
											style={{
												fontFamily: theme.fonts.monospace,
												fontSize: theme.fontSizes[0],
												color: theme.colors.textSecondary,
												cursor: "pointer",
												border: `1px solid ${theme.colors.border ?? "#333"}`,
												borderRadius: 4,
												padding: "1px 6px",
												marginRight: 6,
											}}
											title={f}
										>
											{fileLabel(f)}
										</span>
									))}
								</div>
							)}
							{s.testSuites.map((t, i) => (
								<div
									key={i}
									style={{
										fontFamily: theme.fonts.monospace,
										fontSize: theme.fontSizes[0],
										marginBottom: 4,
									}}
								>
									<span
										role="button"
										tabIndex={0}
										onClick={(e) => {
											e.stopPropagation();
											openPurl(t.file);
										}}
										onKeyDown={(e) => {
											if (e.key === "Enter" || e.key === " ") {
												e.preventDefault();
												openPurl(t.file);
											}
										}}
										style={{ color: theme.colors.text, cursor: "pointer" }}
										title={t.file}
									>
										{fileLabel(t.file)}
									</span>
									{t.exercises.length > 0 && (
										<span style={{ color: muted }}>
											{" "}
											exercises: {t.exercises.join(", ")}
										</span>
									)}
									{t.verifies && <span style={{ color: muted }}> — {t.verifies}</span>}
								</div>
							))}
						</Section>
					)}
				</div>
			)}
		</div>
	);
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
	const { theme } = useTheme();
	const muted = theme.colors.textMuted ?? theme.colors.textSecondary;
	return (
		<div>
			<span
				style={{
					display: "block",
					fontSize: theme.fontSizes[0],
					fontFamily: theme.fonts.monospace,
					textTransform: "uppercase",
					letterSpacing: 1,
					color: muted,
					marginBottom: 8,
				}}
			>
				{title}
			</span>
			{children}
		</div>
	);
}
