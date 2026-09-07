/**
 * GraphifyCliModal — installed version vs PyPI latest, with update / uninstall.
 *
 * Install/update/uninstall and the PyPI check run on the host beyond the RPC
 * window; this modal listens for `graphifyChanged` instead of awaiting them.
 */

import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { useTheme } from "@principal-ade/industry-theme";
import type { GraphifyCliStatus, StudioMessages } from "../../shared/contract";
import { electrobun, graphifyChangeSubscribers } from "../rpc";

export function GraphifyCliModal({
	initial,
	onClose,
	onChanged,
}: {
	initial: GraphifyCliStatus | null;
	onClose: () => void;
	/** Called after install/update/uninstall so the parent can refresh. */
	onChanged: (status: GraphifyCliStatus) => void;
}) {
	const { theme } = useTheme();
	const [status, setStatus] = useState<GraphifyCliStatus | null>(initial);
	const [loading, setLoading] = useState(true);
	const [busy, setBusy] = useState<"update" | "uninstall" | "install" | null>(
		initial?.cliBusy ?? null,
	);
	const [error, setError] = useState<string | null>(null);
	const [confirmUninstall, setConfirmUninstall] = useState(false);
	const onChangedRef = useRef(onChanged);
	onChangedRef.current = onChanged;
	const muted = theme.colors.textMuted ?? theme.colors.textSecondary;

	useEffect(() => {
		let alive = true;
		setLoading(true);
		setError(null);
		void electrobun.rpc!.request
			.getGraphifyStatus({ detailed: true })
			.then((s) => {
				if (!alive) return;
				setStatus(s);
				if (s.cliBusy) setBusy(s.cliBusy);
				onChangedRef.current(s);
				// Local status is enough to paint; PyPI fills in via graphifyChanged.
				setLoading(s.latestVersion == null);
			})
			.catch((err) => {
				if (!alive) return;
				setError(err instanceof Error ? err.message : String(err));
				setLoading(false);
			});

		const onPush = (payload: StudioMessages["graphifyChanged"]) => {
			if (payload.kind !== "cli" || !payload.status) return;
			setStatus(payload.status);
			onChangedRef.current(payload.status);
			setLoading(false);
			if (payload.status.cliBusy) {
				setBusy(payload.status.cliBusy);
			} else {
				setBusy(null);
				setConfirmUninstall(false);
			}
			if (payload.error) setError(payload.error);
		};
		graphifyChangeSubscribers.add(onPush);
		return () => {
			alive = false;
			graphifyChangeSubscribers.delete(onPush);
		};
	}, []);

	const run = async (action: "update" | "uninstall" | "install") => {
		setBusy(action);
		setError(null);
		try {
			const result =
				action === "update"
					? await electrobun.rpc!.request.updateGraphify({})
					: action === "uninstall"
						? await electrobun.rpc!.request.uninstallGraphify({})
						: await electrobun.rpc!.request.installGraphify({});
			if (!result.ok) {
				setError(result.error ?? `${action} failed`);
				setBusy(null);
				if (result.status) {
					setStatus(result.status);
					onChangedRef.current(result.status);
				}
				return;
			}
			if (result.status) {
				setStatus(result.status);
				onChangedRef.current(result.status);
			}
			// Background job: keep busy until graphifyChanged clears cliBusy.
			if (result.started && result.status?.cliBusy) {
				setBusy(result.status.cliBusy);
			} else {
				setBusy(null);
				setConfirmUninstall(false);
			}
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
			setBusy(null);
		}
	};

	const btn = (primary: boolean, danger = false) => ({
		padding: "8px 14px",
		borderRadius: 6,
		border: `1px solid ${danger ? "#e5534b88" : theme.colors.border}`,
		background: danger
			? "transparent"
			: primary
				? theme.colors.primary
				: "transparent",
		color: danger
			? "#e5534b"
			: primary
				? theme.colors.background
				: theme.colors.text,
		cursor: busy ? "wait" : "pointer",
		fontSize: theme.fontSizes[1],
		fontFamily: theme.fonts.body,
		opacity: busy ? 0.7 : 1,
	});

	return (
		<div
			role="dialog"
			aria-modal
			aria-label="Graphify CLI"
			onClick={onClose}
			style={{
				position: "fixed",
				inset: 0,
				zIndex: 2147483000,
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
				background: "rgba(0,0,0,0.55)",
				fontFamily: theme.fonts.body,
			}}
		>
			<div
				onClick={(e) => e.stopPropagation()}
				style={{
					width: "min(440px, calc(100vw - 48px))",
					display: "flex",
					flexDirection: "column",
					background: theme.colors.surface,
					border: `1px solid ${theme.colors.border}`,
					borderRadius: 12,
					overflow: "hidden",
					boxShadow: "0 12px 48px rgba(0,0,0,0.4)",
					color: theme.colors.text,
				}}
			>
				<div
					style={{
						display: "flex",
						alignItems: "center",
						justifyContent: "space-between",
						gap: 12,
						padding: "14px 20px",
						borderBottom: `1px solid ${theme.colors.border}`,
						background: theme.colors.background,
					}}
				>
					<span style={{ fontSize: theme.fontSizes[3], fontWeight: 600 }}>
						Graphify CLI
					</span>
					<button
						type="button"
						onClick={onClose}
						style={{
							border: "none",
							background: "transparent",
							color: muted,
							cursor: "pointer",
							fontSize: theme.fontSizes[2],
							lineHeight: 1,
							padding: 4,
						}}
						aria-label="Close"
					>
						✕
					</button>
				</div>

				<div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 12 }}>
					{loading && (
						<div style={{ display: "flex", alignItems: "center", gap: 8, color: muted }}>
							<Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} />
							Checking PyPI for the latest version…
						</div>
					)}

					{status && (
						<>
							<div style={{ fontSize: theme.fontSizes[2], fontWeight: 500 }}>
								{status.installed ? "Installed" : "Not installed"}
							</div>
							<div
								style={{
									fontSize: theme.fontSizes[1],
									color: muted,
									fontFamily: theme.fonts.monospace,
									display: "flex",
									flexDirection: "column",
									gap: 4,
								}}
							>
								<div>
									Installed:{" "}
									{status.installedVersion ?? (status.installed ? "unknown" : "—")}
								</div>
								<div>Latest (PyPI): {status.latestVersion ?? (loading ? "…" : "unknown")}</div>
								{status.bin && (
									<div style={{ wordBreak: "break-all" }}>Path: {status.bin}</div>
								)}
							</div>
							{status.installed && status.updateAvailable === true && (
								<div style={{ fontSize: theme.fontSizes[1], color: theme.colors.primary }}>
									An update is available.
								</div>
							)}
							{status.installed && status.updateAvailable === false && status.latestVersion && (
								<div style={{ fontSize: theme.fontSizes[1], color: muted }}>
									You are on the latest version.
								</div>
							)}
						</>
					)}

					{error && (
						<div style={{ fontSize: theme.fontSizes[1], color: "#e5534b" }}>{error}</div>
					)}

					<div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 4 }}>
						{!status?.installed ? (
							<button
								type="button"
								style={btn(true)}
								disabled={busy !== null}
								onClick={() => void run("install")}
							>
								{busy === "install" ? "Installing…" : "Install"}
							</button>
						) : (
							<>
								<button
									type="button"
									style={btn(Boolean(status.updateAvailable))}
									disabled={busy !== null || status.updateAvailable === false}
									onClick={() => void run("update")}
									title={
										status.updateAvailable
											? "Upgrade via uv tool upgrade graphifyy"
											: "Already up to date"
									}
								>
									{busy === "update" ? "Updating…" : "Update"}
								</button>
								<button
									type="button"
									style={btn(false, true)}
									disabled={busy !== null}
									onClick={() => {
										if (!confirmUninstall) {
											setConfirmUninstall(true);
											return;
										}
										void run("uninstall");
									}}
								>
									{busy === "uninstall"
										? "Uninstalling…"
										: confirmUninstall
											? "Confirm uninstall"
											: "Uninstall"}
								</button>
							</>
						)}
					</div>
				</div>
			</div>
		</div>
	);
}
