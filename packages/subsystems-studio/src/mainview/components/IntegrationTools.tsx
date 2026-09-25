/**
 * IntegrationTools — the header's Graphify + OpenCode logo buttons. Clicking a
 * mark opens a modal that says whether the tool is installed, whether a newer
 * build is available, and what Studio uses it for. Install/update run on the
 * host beyond the RPC window; the modal listens for the host's status pushes
 * (`graphifyChanged` / `opencodeV2Changed`) instead of awaiting them.
 *
 * The two tools are described by {@link INTEGRATION_TOOLS} so the button + modal
 * are shared. Graphify's PyPI check and OpenCode's npm-beta check are the only
 * network calls, and only on open (detailed status).
 */

import {
	useEffect,
	useRef,
	useState,
	type CSSProperties,
	type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { ExternalLink, Loader2 } from "lucide-react";
import { useTheme } from "@principal-ade/industry-theme";
import type {
	OpencodeServerStatus,
	StudioMessages,
} from "../../shared/contract";
import {
	electrobun,
	graphifyChangeSubscribers,
	opencodeV2ChangeSubscribers,
} from "../rpc";

// The shared shape of GraphifyCliStatus and OpencodeV2Status — enough for the
// button's status dot and the modal's version/update rows.
type IntegrationStatus = {
	installed: boolean;
	bin: string | null;
	installedVersion: string | null;
	latestVersion: string | null;
	updateAvailable: boolean | null;
	cliBusy?: "install" | "update" | "uninstall" | null;
};

type CliActionResult = {
	ok: boolean;
	error?: string;
	started?: boolean;
	status?: IntegrationStatus;
};

type IntegrationId = "graphify" | "opencode";

interface IntegrationSpec {
	id: IntegrationId;
	name: string;
	/** One-line role, shown under the name. */
	tagline: string;
	/** What Studio uses the tool for — the modal's lead paragraph. */
	usage: ReactNode;
	homepage: string;
	homepageLabel: string;
	mark: (size: number) => ReactNode;
	/** Mark carries its own tile (e.g. an avatar) — fill the button edge to edge
	 *  instead of insetting it. */
	bleed?: boolean;
	getStatus: (detailed: boolean) => Promise<IntegrationStatus>;
	install: () => Promise<CliActionResult>;
	update: () => Promise<CliActionResult>;
	uninstall?: () => Promise<CliActionResult>;
	subscribe: (
		cb: (status: IntegrationStatus, error?: string) => void,
	) => () => void;
	/** Optional extra row below the version block (e.g. the OpenCode server). */
	extra?: ReactNode;
}

// ---------------------------------------------------------------------------
// Marks — inline so they can follow the theme's text color / sizing.
// ---------------------------------------------------------------------------

/** Graphify's mark — the `Graphify-Labs` owner avatar (white wireframe "G" on
 *  the brand green), vendored under `agent-logos/` like the other agent marks. */
function GraphifyMark({ size }: { size: number }) {
	return (
		<img
			src="/agent-logos/graphify.png"
			alt=""
			width={size}
			height={size}
			style={{ display: "block", objectFit: "cover" }}
			onError={(e) => {
				(e.currentTarget as HTMLImageElement).style.visibility = "hidden";
			}}
		/>
	);
}

/** OpenCode's mark — recreated from `@opencode-ai/ui/logo`'s Mark, using
 *  `currentColor` so it follows the button/modal text color. */
function OpencodeMark({ size }: { size: number }) {
	return (
		<svg
			viewBox="0 0 16 20"
			width={(size * 16) / 20}
			height={size}
			aria-hidden="true"
		>
			<path d="M12 16H4V8H12V16Z" fill="currentColor" opacity={0.55} />
			<path d="M12 4H4V16H12V4ZM16 20H0V0H16V20Z" fill="currentColor" />
		</svg>
	);
}

// ---------------------------------------------------------------------------
// OpenCode background server — a live row the OpenCode modal shows beneath the
// CLI version, since Maintain runs through the server, not the binary alone.
// ---------------------------------------------------------------------------

function OpencodeServerRow() {
	const { theme } = useTheme();
	const muted = theme.colors.textMuted ?? theme.colors.textSecondary;
	const [server, setServer] = useState<OpencodeServerStatus | null>(null);

	useEffect(() => {
		let alive = true;
		const check = () => {
			void electrobun.rpc!.request
				.getOpencodeServerStatus({})
				.then((s: OpencodeServerStatus) => {
					if (alive) setServer(s);
				})
				.catch(() => {
					if (alive) setServer(null);
				});
		};
		check();
		const id = setInterval(check, 10_000);
		return () => {
			alive = false;
			clearInterval(id);
		};
	}, []);

	const running = server?.running === true;
	return (
		<div style={{ fontSize: theme.fontSizes[0], color: muted, lineHeight: 1.5 }}>
			Background server:{" "}
			<span style={{ color: theme.colors.text, fontWeight: 600 }}>
				{server == null ? "checking…" : running ? "running" : "not running"}
			</span>
			{running && server?.url && (
				<span style={{ fontFamily: theme.fonts.monospace }}> — {server.url}</span>
			)}
		</div>
	);
}

// ---------------------------------------------------------------------------
// Tool specs
// ---------------------------------------------------------------------------

const GRAPHIFY_TOOL: IntegrationSpec = {
	id: "graphify",
	name: "Graphify",
	tagline: "Code knowledge graph",
	usage: (
		<>
			Graphify turns a checkout into a queryable knowledge graph of files,
			symbols, and their edges. Studio uses it as the ground truth it audits
			subsystem models against — anchoring each component to a real definition,
			corroborating construct/signature claims, and checking that typed
			relations exist in the code. The Graphify tab builds and caches a graph
			per repo at its current HEAD.
		</>
	),
	homepage: "https://graphify.com",
	homepageLabel: "graphify.com",
	mark: (size) => <GraphifyMark size={size} />,
	bleed: true,
	getStatus: (detailed) => electrobun.rpc!.request.getGraphifyStatus({ detailed }),
	install: () => electrobun.rpc!.request.installGraphify({}),
	update: () => electrobun.rpc!.request.updateGraphify({}),
	uninstall: () => electrobun.rpc!.request.uninstallGraphify({}),
	subscribe: (cb) => {
		const onPush = (payload: StudioMessages["graphifyChanged"]) => {
			if (payload.kind !== "cli" || !payload.status) return;
			cb(payload.status, payload.error);
		};
		graphifyChangeSubscribers.add(onPush);
		return () => {
			graphifyChangeSubscribers.delete(onPush);
		};
	},
};

const OPENCODE_TOOL: IntegrationSpec = {
	id: "opencode",
	name: "OpenCode",
	tagline: "Agent runtime",
	usage: (
		<>
			OpenCode is the agent runtime Studio drives. Maintain runs (the construct,
			static-topology, package/module, and runtime verifiers/fixers) and concept
			extraction execute through it,
			with each run's events streamed back into the Maintain and session tabs.
			Studio installs the v2 binary as <code>opencode2</code> so an existing v1
			install is left untouched.
		</>
	),
	homepage: "https://opencode.ai",
	homepageLabel: "opencode.ai",
	mark: (size) => <OpencodeMark size={size} />,
	getStatus: (detailed) => electrobun.rpc!.request.getOpencodeV2Status({ detailed }),
	install: () => electrobun.rpc!.request.installOpencodeV2({}),
	update: () => electrobun.rpc!.request.updateOpencodeV2({}),
	subscribe: (cb) => {
		const onPush = (payload: StudioMessages["opencodeV2Changed"]) => {
			cb(payload.status, payload.error);
		};
		opencodeV2ChangeSubscribers.add(onPush);
		return () => {
			opencodeV2ChangeSubscribers.delete(onPush);
		};
	},
	extra: <OpencodeServerRow />,
};

export const INTEGRATION_TOOLS: IntegrationSpec[] = [GRAPHIFY_TOOL, OPENCODE_TOOL];

// ---------------------------------------------------------------------------
// Status helpers
// ---------------------------------------------------------------------------

function statusDotColor(
	status: IntegrationStatus | null,
	theme: ReturnType<typeof useTheme>["theme"],
): string {
	const muted = theme.colors.textMuted ?? theme.colors.textSecondary;
	if (!status) return muted;
	if (!status.installed) return theme.colors.error ?? "#e5534b";
	if (status.updateAvailable === true) return theme.colors.warning ?? "#e5a33d";
	return theme.colors.success ?? "#3d9a5f";
}

function statusTitle(spec: IntegrationSpec, status: IntegrationStatus | null): string {
	if (!status) return `${spec.name} — checking…`;
	if (!status.installed) return `${spec.name} is not installed — click for details`;
	if (status.updateAvailable === true)
		return `${spec.name} ${status.installedVersion ?? ""} — update available`;
	return `${spec.name}${status.installedVersion ? ` ${status.installedVersion}` : ""} — up to date`;
}

// ---------------------------------------------------------------------------
// Header buttons
// ---------------------------------------------------------------------------

function IntegrationLogoButton({
	spec,
	status,
	onClick,
}: {
	spec: IntegrationSpec;
	status: IntegrationStatus | null;
	onClick: () => void;
}) {
	const { theme } = useTheme();
	const dot = statusDotColor(status, theme);
	const fill = spec.bleed === true;
	return (
		<button
			type="button"
			onClick={onClick}
			title={statusTitle(spec, status)}
			aria-label={statusTitle(spec, status)}
			aria-haspopup="dialog"
			style={{
				position: "relative",
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
				width: 32,
				height: 32,
				borderRadius: 6,
				background: "transparent",
				border: fill ? "none" : `1px solid ${theme.colors.border}`,
				overflow: fill ? "hidden" : "visible",
				padding: 0,
				color: theme.colors.text,
				cursor: "pointer",
				flexShrink: 0,
			}}
		>
			{spec.mark(fill ? 32 : 20)}
			<span
				style={{
					position: "absolute",
					right: 2,
					bottom: 2,
					width: 8,
					height: 8,
					borderRadius: "50%",
					background: dot,
					border: `1.5px solid ${theme.colors.surface}`,
				}}
			/>
		</button>
	);
}

/**
 * IntegrationLogos — the pair of header logo buttons plus the shared modal.
 * Keeps its own lightweight (non-detailed) status snapshot so the dots are live
 * without opening anything; the modal does the network version check on open.
 */
export function IntegrationLogos() {
	const [statuses, setStatuses] = useState<
		Partial<Record<IntegrationId, IntegrationStatus>>
	>({});
	const [open, setOpen] = useState<IntegrationSpec | null>(null);

	useEffect(() => {
		let alive = true;
		for (const spec of INTEGRATION_TOOLS) {
			void spec
				.getStatus(false)
				.then((s) => {
					if (alive) setStatuses((prev) => ({ ...prev, [spec.id]: s }));
				})
				.catch(() => {
					/* best-effort: the dot stays neutral */
				});
		}
		const unsubs = INTEGRATION_TOOLS.map((spec) =>
			spec.subscribe((s) => {
				setStatuses((prev) => ({ ...prev, [spec.id]: s }));
			}),
		);
		return () => {
			alive = false;
			for (const unsub of unsubs) unsub();
		};
	}, []);

	const setStatus = (id: IntegrationId, status: IntegrationStatus) =>
		setStatuses((prev) => ({ ...prev, [id]: status }));

	return (
		<>
			{INTEGRATION_TOOLS.map((spec) => (
				<IntegrationLogoButton
					key={spec.id}
					spec={spec}
					status={statuses[spec.id] ?? null}
					onClick={() => setOpen(spec)}
				/>
			))}
			{open &&
				createPortal(
					<IntegrationModal
						spec={open}
						initial={statuses[open.id] ?? null}
						onClose={() => setOpen(null)}
						onStatus={(s) => setStatus(open.id, s)}
					/>,
					document.body,
				)}
		</>
	);
}

// ---------------------------------------------------------------------------
// Modal
// ---------------------------------------------------------------------------

export function IntegrationModal({
	spec,
	initial,
	onClose,
	onStatus,
}: {
	spec: IntegrationSpec;
	initial: IntegrationStatus | null;
	onClose: () => void;
	onStatus: (status: IntegrationStatus) => void;
}) {
	const { theme } = useTheme();
	const muted = theme.colors.textMuted ?? theme.colors.textSecondary;
	const [status, setStatus] = useState<IntegrationStatus | null>(initial);
	const [loading, setLoading] = useState(true);
	const [busy, setBusy] = useState<"install" | "update" | "uninstall" | null>(
		initial?.cliBusy ?? null,
	);
	const [error, setError] = useState<string | null>(null);
	const [confirmUninstall, setConfirmUninstall] = useState(false);
	const onStatusRef = useRef(onStatus);
	onStatusRef.current = onStatus;

	useEffect(() => {
		let alive = true;
		setLoading(true);
		setError(null);
		void spec
			.getStatus(true)
			.then((s) => {
				if (!alive) return;
				setStatus(s);
				if (s.cliBusy) setBusy(s.cliBusy);
				onStatusRef.current(s);
				// Local status is enough to paint; the registry check fills in
				// via the host's status push.
				setLoading(s.latestVersion == null);
			})
			.catch((err) => {
				if (!alive) return;
				setError(err instanceof Error ? err.message : String(err));
				setLoading(false);
			});

		const unsub = spec.subscribe((s, pushError) => {
			setStatus(s);
			onStatusRef.current(s);
			setLoading(false);
			if (s.cliBusy) {
				setBusy(s.cliBusy);
			} else {
				setBusy(null);
				setConfirmUninstall(false);
			}
			if (pushError) setError(pushError);
		});
		return () => {
			alive = false;
			unsub();
		};
	}, [spec]);

	const run = async (action: "install" | "update" | "uninstall") => {
		setBusy(action);
		setError(null);
		try {
			const result =
				action === "install"
					? await spec.install()
					: action === "update"
						? await spec.update()
						: await spec.uninstall!();
			if (!result.ok) {
				setError(result.error ?? `${action} failed`);
				setBusy(null);
				if (result.status) {
					setStatus(result.status);
					onStatusRef.current(result.status);
				}
				return;
			}
			if (result.status) {
				setStatus(result.status);
				onStatusRef.current(result.status);
			}
			// Background job: keep busy until the status push clears cliBusy.
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

	const btn = (primary: boolean, danger = false): CSSProperties => ({
		display: "inline-flex",
		alignItems: "center",
		gap: 6,
		padding: "8px 14px",
		borderRadius: 6,
		border: `1px solid ${danger ? "#e5534b88" : theme.colors.border}`,
		background: danger ? "transparent" : primary ? theme.colors.primary : "transparent",
		color: danger
			? "#e5534b"
			: primary
				? theme.colors.background
				: theme.colors.text,
		cursor: busy ? "wait" : "pointer",
		fontSize: theme.fontSizes[1],
		fontFamily: theme.fonts.body,
		fontWeight: 500,
		opacity: busy ? 0.7 : 1,
	});

	const installed = status?.installed === true;
	const upToDate =
		installed && status?.updateAvailable === false && status?.latestVersion != null;

	return (
		<div
			role="dialog"
			aria-modal
			aria-label={spec.name}
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
					width: "min(480px, calc(100vw - 48px))",
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
				{/* Header: mark + name + role. */}
				<div
					style={{
						display: "flex",
						alignItems: "center",
						gap: 12,
						padding: "14px 20px",
						borderBottom: `1px solid ${theme.colors.border}`,
						background: theme.colors.background,
					}}
				>
					<span
						style={{
							display: "flex",
							alignItems: "center",
							justifyContent: "center",
							width: 34,
							height: 34,
							borderRadius: 8,
							border: spec.bleed
								? "none"
								: `1px solid ${theme.colors.border}`,
							overflow: spec.bleed ? "hidden" : "visible",
							flexShrink: 0,
						}}
					>
						{spec.mark(spec.bleed ? 34 : 22)}
					</span>
					<div style={{ flex: 1, minWidth: 0 }}>
						<div style={{ fontSize: theme.fontSizes[3], fontWeight: 600 }}>
							{spec.name}
						</div>
						<div style={{ fontSize: theme.fontSizes[0], color: muted }}>
							{spec.tagline}
						</div>
					</div>
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

				<div
					style={{
						padding: "16px 20px",
						display: "flex",
						flexDirection: "column",
						gap: 14,
					}}
				>
					{/* What it's used for. */}
					<div
						style={{
							fontSize: theme.fontSizes[1],
							color: theme.colors.text,
							lineHeight: 1.55,
						}}
					>
						{spec.usage}
					</div>

					{/* Install / version / update. */}
					<div
						style={{
							padding: "12px 14px",
							borderRadius: 8,
							background: theme.colors.background,
							border: `1px solid ${theme.colors.border}`,
							display: "flex",
							flexDirection: "column",
							gap: 6,
						}}
					>
						{loading && (
							<div style={{ display: "flex", alignItems: "center", gap: 8, color: muted, fontSize: theme.fontSizes[1] }}>
								<Loader2 size={14} className="principal-studio-spin" />
								Checking for the latest version…
							</div>
						)}

						{status && (
							<>
								<div style={{ fontSize: theme.fontSizes[1], fontWeight: 600 }}>
									{installed ? "Installed" : "Not installed"}
									{busy ? (
										<span style={{ marginLeft: 8, color: muted, fontWeight: 500 }}>
											({busy}…)
										</span>
									) : null}
								</div>
								<div
									style={{
										fontSize: theme.fontSizes[0],
										color: muted,
										fontFamily: theme.fonts.monospace,
										display: "flex",
										flexDirection: "column",
										gap: 3,
									}}
								>
									<div>
										Installed:{" "}
										{status.installedVersion ?? (installed ? "unknown" : "—")}
									</div>
									<div>
										Latest: {status.latestVersion ?? (loading ? "…" : "unknown")}
									</div>
									{status.bin && (
										<div style={{ wordBreak: "break-all" }}>Path: {status.bin}</div>
									)}
								</div>
								{installed && status.updateAvailable === true && (
									<div style={{ fontSize: theme.fontSizes[0], color: theme.colors.warning ?? "#e5a33d" }}>
										An update is available.
									</div>
								)}
								{upToDate && (
									<div style={{ fontSize: theme.fontSizes[0], color: muted }}>
										You are on the latest version.
									</div>
								)}
							</>
						)}

						{spec.extra}
					</div>

					{error && (
						<div style={{ fontSize: theme.fontSizes[1], color: "#e5534b" }}>
							{error}
						</div>
					)}

					{/* Actions. */}
					<div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
						{!installed ? (
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
									style={btn(status?.updateAvailable === true)}
									disabled={busy !== null || status?.updateAvailable === false}
									onClick={() => void run("update")}
									title={
										status?.updateAvailable
											? "Update to the latest version"
											: "Already up to date"
									}
								>
									{busy === "update" ? "Updating…" : "Update"}
								</button>
								{spec.uninstall && (
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
								)}
							</>
						)}
						<button
							type="button"
							style={{ ...btn(false), marginLeft: "auto" }}
							onClick={() =>
								void electrobun.rpc!.request.openExternal({
									url: spec.homepage,
								})
							}
						>
							<ExternalLink size={14} />
							<span>{spec.homepageLabel}</span>
						</button>
					</div>
				</div>
			</div>
		</div>
	);
}
