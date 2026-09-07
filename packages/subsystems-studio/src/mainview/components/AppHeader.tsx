/**
 * AppHeader — persistent app chrome above the tab strip. Carries the Principal
 * AI brand (moved up out of the per-trail TrailHeader so it shows on every tab,
 * including the library) and the Download app CTA. Plus the IdentityModal it
 * portals (clicking the identity chip explains where the name/avatar came from
 * rather than jumping straight to GitHub).
 */

import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import {
	AlertTriangle,
	ExternalLink,
	GitBranch,
	Info,
	Loader2,
	RefreshCw,
	Settings,
	Terminal,
	User,
} from "lucide-react";
import { useTheme } from "@principal-ade/industry-theme";
import { FileCityLogo } from "@principal-ai/logo-component";
import type {
	AnalysisSummary,
	ConceptAnalysis,
	OpencodeServerStatus,
	UserIdentity,
} from "../../shared/contract";
import { electrobun, refreshLibrary, reloadSubscribers } from "../rpc";
import { FailuresModal } from "./FailuresModal";
import { PendingAnalysesModal } from "./PendingAnalysesModal";
import { ServerSessionsModal } from "./ServerSessionsModal";
import { SettingsModal } from "./SettingsModal";

// The opencode server status chip (v2 pill + health dot) is hidden for now —
// flip to true to bring it back. Everything behind it (the 10s health poll,
// the modal, the RPC) stays wired so the flag is the only change.
const SHOW_SERVER_CHIP = false;

export function AppHeader({ libraryActive }: { libraryActive: boolean }) {
	const { theme } = useTheme();

	// Who's using the viewer — resolved host-side (gh CLI → token → git config).
	// Fetched once on mount; `source: "none"` (or null while pending) hides it.
	const [user, setUser] = useState<UserIdentity | null>(null);
	useEffect(() => {
		let alive = true;
		void electrobun.rpc!.request
			.getUserIdentity({})
			.then((u) => {
				if (alive) setUser(u);
			})
			.catch(() => {
				/* best-effort: leave the header user-less */
			});
		return () => {
			alive = false;
		};
	}, []);

	// Whether the opencode v2 server is up. Probed host-side (reads the server's
	// registration + password from disk, then GETs /api/health) and polled here
	// every 10s so the chip tracks the server coming and going without the user
	// refreshing. `null` = first probe not yet answered (or a probe error).
	const [serverStatus, setServerStatus] = useState<OpencodeServerStatus | null>(null);
	useEffect(() => {
		let alive = true;
		const check = async () => {
			try {
				const status = await electrobun.rpc!.request.getOpencodeServerStatus({});
				if (alive) setServerStatus(status);
			} catch {
				if (alive) setServerStatus(null);
			}
		};
		void check();
		const id = setInterval(() => void check(), 10_000);
		return () => {
			alive = false;
			clearInterval(id);
		};
	}, []);

	// Clicking the server chip opens the active/recent session list.
	const [showServerSessions, setShowServerSessions] = useState(false);

	// Clicking the identity chip explains where the name/avatar came from rather
	// than jumping straight to GitHub — the profile link lives inside the modal.
	const [showIdentityModal, setShowIdentityModal] = useState(false);

	// Header Settings gear — toggles which permanent tabs show by default.
	const [showSettings, setShowSettings] = useState(false);

	// In-flight background work (concept analysis extraction). The host
	// broadcasts tabsChanged when an extraction starts, completes, or fails, so
	// subscribing here keeps the activity chip live without polling.
	const [analyses, setAnalyses] = useState<AnalysisSummary[]>([]);
	const loadAnalyses = useCallback(() => {
		void electrobun.rpc!.request
			.listAnalyses({})
			.then((res) => setAnalyses(res.analyses))
			.catch(() => {});
	}, []);
	useEffect(() => {
		loadAnalyses();
		reloadSubscribers.add(loadAnalyses);
		return () => {
			reloadSubscribers.delete(loadAnalyses);
		};
	}, [loadAnalyses]);

	const pending = analyses.filter((a) => a.status === "pending");
	const failed = analyses.filter((a) => a.status === "error");
	const activityLabel = pending.length === 1
		? pending[0]?.sessionTitle?.trim() || pending[0]?.sessionId.slice(0, 16)
		: `${pending.length} sessions`;

	// Pending-analysis modal: same lazy-full-fetch pattern as failures — the
	// header keeps only lightweight summaries; full records (agent, createdAt)
	// load when the chip is clicked. Discarding removes the record host-side
	// and the tabsChanged broadcast refreshes the chip automatically.
	const [showPending, setShowPending] = useState(false);
	const [pendingFull, setPendingFull] = useState<ConceptAnalysis[]>([]);
	const [discardingId, setDiscardingId] = useState<string | null>(null);

	const openPending = useCallback(() => {
		setShowPending(true);
		void electrobun.rpc!.request
			.listAnalysesFull({})
			.then((res) =>
				setPendingFull(res.analyses.filter((a) => a.status === "pending")),
			)
			.catch(() => {});
	}, []);

	const discardAnalysis = useCallback(async (a: ConceptAnalysis) => {
		setDiscardingId(a.id);
		try {
			await electrobun.rpc!.request.deleteAnalysis({ analysisId: a.id });
			setPendingFull((prev) => prev.filter((x) => x.id !== a.id));
		} catch {
			// The tabsChanged broadcast re-surfaces whatever happened.
		} finally {
			setDiscardingId(null);
		}
	}, []);

	// Failed-analysis modal: full records (with `error`) are fetched lazily when
	// the chip is clicked, so the header only pays for the lightweight summaries
	// on every tabsChanged refresh.
	const [showFailures, setShowFailures] = useState(false);
	const [failedFull, setFailedFull] = useState<ConceptAnalysis[]>([]);
	const [retryingId, setRetryingId] = useState<string | null>(null);

	const openFailures = useCallback(() => {
		setShowFailures(true);
		void electrobun.rpc!.request
			.listAnalysesFull({})
			.then((res) =>
				setFailedFull(res.analyses.filter((a) => a.status === "error")),
			)
			.catch(() => {});
	}, []);

	const retryAnalysis = useCallback(async (a: ConceptAnalysis) => {
		setRetryingId(a.id);
		try {
			await electrobun.rpc!.request.analyzeSession({
				sessionId: a.sessionId,
				title: a.sessionTitle,
				agent: a.agent,
				force: true,
			});
		} catch {
			// The tabsChanged broadcast re-surfaces whatever failed.
		} finally {
			setRetryingId(null);
		}
	}, []);

	const deleteAnalysis = useCallback((a: ConceptAnalysis) => {
		void electrobun.rpc!.request
			.deleteAnalysis({ analysisId: a.id })
			.then(() =>
				setFailedFull((prev) => prev.filter((x) => x.id !== a.id)),
			)
			.catch(() => {});
	}, []);

	// const DOWNLOAD_APP_URL = "https://principal-ade.com/download";
	// const onDownload = useCallback(() => {
	// 	void electrobun.rpc!.request.openExternal({ url: DOWNLOAD_APP_URL });
	// }, []);

	const onOpenProfile = useCallback(() => {
		if (user?.htmlUrl) {
			void electrobun.rpc!.request.openExternal({ url: user.htmlUrl });
		}
	}, [user]);

	return (
		<>{/* fragment so the provenance modal can portal as a header sibling */}
		<header
			style={{
				display: "flex",
				alignItems: "center",
				gap: 8,
				padding: "16px 16px",
				background: theme.colors.surface,
				borderBottom: `1px solid ${theme.colors.border}`,
				flexShrink: 0,
				fontFamily: theme.fonts.body,
			}}
		>
			<div
				style={{
					display: "flex",
					alignItems: "center",
					gap: 12,
					flex: 1,
					minWidth: 0,
				}}
			>
				<div
					style={{
						display: "flex",
						flexShrink: 0,
						borderRadius: 10,
						border: `1px solid ${theme.colors.primary}`,
					}}
				>
					<FileCityLogo
						width={40}
						height={40}
						mark="P"
						primary="#ff6b35"
						accent="#0893d2"
						color="#d0e5ea"
						background="transparent"
					/>
				</div>
				<span style={{ fontSize: theme.fontSizes[6], fontWeight: 700 }}>
					<span style={{ color: theme.colors.text }}>Subsystems</span>{" "}
					<span style={{ color: theme.colors.primary }}>Studio</span>
				</span>
			</div>
			{libraryActive && (
				<button
					type="button"
					onClick={refreshLibrary}
					title="Refresh trail library"
					aria-label="Refresh trail library"
					style={{
						display: "flex",
						alignItems: "center",
						justifyContent: "center",
						width: 32,
						height: 32,
						borderRadius: 6,
						background: "transparent",
						border: "none",
						color: theme.colors.text,
						cursor: "pointer",
						flexShrink: 0,
					}}
				>
					<RefreshCw size={16} />
				</button>
			)}
			{pending.length > 0 && (
				<span
					role="button"
					tabIndex={0}
					onClick={openPending}
					onKeyDown={(e) => {
						if (e.key === "Enter" || e.key === " ") {
							e.preventDefault();
							openPending();
						}
					}}
					style={{
						display: "flex",
						alignItems: "center",
						gap: 6,
						height: 32,
						padding: "0 12px",
						borderRadius: 16,
						background: theme.colors.background,
						border: `1px solid ${theme.colors.primary}`,
						color: theme.colors.text,
						fontSize: theme.fontSizes[1],
						fontFamily: theme.fonts.monospace,
						flexShrink: 0,
						maxWidth: 260,
						cursor: "pointer",
					}}
					title="View pending concept extractions"
					aria-haspopup="dialog"
				>
					<Loader2 size={14} className="principal-studio-spin" />
					<span
						style={{
							overflow: "hidden",
							textOverflow: "ellipsis",
							whiteSpace: "nowrap",
						}}
					>
						Analyzing {activityLabel}…
					</span>
				</span>
			)}
			{failed.length > 0 && pending.length === 0 && (
				<span
					role="button"
					tabIndex={0}
					onClick={openFailures}
					onKeyDown={(e) => {
						if (e.key === "Enter" || e.key === " ") {
							e.preventDefault();
							openFailures();
						}
					}}
					style={{
						display: "flex",
						alignItems: "center",
						gap: 6,
						height: 32,
						padding: "0 12px",
						borderRadius: 16,
						background: theme.colors.background,
						border: `1px solid ${theme.colors.error ?? "#e5534b"}`,
						color: theme.colors.error ?? "#e5534b",
						fontSize: theme.fontSizes[1],
						fontFamily: theme.fonts.monospace,
						flexShrink: 0,
						maxWidth: 260,
						cursor: "pointer",
					}}
					title="View failed concept extractions and retry them"
					aria-haspopup="dialog"
				>
					<AlertTriangle size={14} />
					<span
						style={{
							overflow: "hidden",
							textOverflow: "ellipsis",
							whiteSpace: "nowrap",
						}}
					>
						{failed.length === 1
							? "1 analysis failed"
							: `${failed.length} analyses failed`}
					</span>
				</span>
			)}
			{SHOW_SERVER_CHIP && (
			<button
				type="button"
				onClick={() => setShowServerSessions(true)}
				aria-label={
					serverStatus === null
						? "Open active sessions. Server status unknown."
						: serverStatus.running
							? `Open active sessions. Server running at ${serverStatus.url}.`
							: "Open active sessions. Server is not running."
				}
				title={
					serverStatus === null
						? "Checking the opencode server…"
						: serverStatus.running
							? `opencode server running at ${serverStatus.url} — click for active sessions`
							: "opencode server is not running"
				}
				aria-haspopup="dialog"
				style={{
					display: "flex",
					alignItems: "center",
					gap: 7,
					height: 32,
					padding: "0 10px 0 12px",
					borderRadius: 16,
					background: theme.colors.background,
					border: `1px solid ${
						serverStatus === null
							? theme.colors.border
							: serverStatus.running
								? theme.colors.success
								: theme.colors.error
					}`,
					color: theme.colors.text,
					fontFamily: theme.fonts.body,
					cursor: "pointer",
					flexShrink: 0,
				}}
			>
				{/* opencode mark — recreated from @opencode-ai/ui/logo's Mark
				    (SolidJS + CSS vars there; inline + theme colors here). */}
				<svg viewBox="0 0 16 20" width={12} height={15} aria-hidden="true" style={{ flexShrink: 0 }}>
					<path
						d="M12 16H4V8H12V16Z"
						fill={theme.colors.textMuted ?? theme.colors.textSecondary}
					/>
					<path d="M12 4H4V16H12V4ZM16 20H0V0H16V20Z" fill={theme.colors.text} />
				</svg>
				<span
					style={{
						fontFamily: theme.fonts.monospace,
						fontSize: theme.fontSizes[0],
						fontWeight: 600,
						lineHeight: 1,
						color: theme.colors.text,
					}}
				>
					v2
				</span>
				<span
					style={{
						width: 8,
						height: 8,
						borderRadius: "50%",
						flexShrink: 0,
						background:
							serverStatus === null
								? theme.colors.textMuted ?? theme.colors.textSecondary
								: serverStatus.running
									? theme.colors.success
									: theme.colors.error,
					}}
				/>
			</button>
			)}
			{user && user.source !== "none" && (
				<button
					type="button"
					onClick={() => setShowIdentityModal(true)}
					title="Where does this identity come from?"
					aria-label={
						user.login ? `GitHub user ${user.login}` : "Git user"
					}
					aria-haspopup="dialog"
					style={{
						display: "flex",
						alignItems: "center",
						gap: 6,
						padding: user.avatarUrl ? "2px 8px 2px 2px" : "0 10px",
						height: 32,
						borderRadius: 16,
						background: theme.colors.background,
						border: `1px solid ${theme.colors.border}`,
						color: theme.colors.text,
						fontSize: theme.fontSizes[1],
						fontFamily: theme.fonts.body,
						cursor: "pointer",
						flexShrink: 0,
						maxWidth: 180,
					}}
				>
					{user.avatarUrl && (
						<img
							src={user.avatarUrl}
							alt=""
							width={26}
							height={26}
							style={{ borderRadius: "50%", flexShrink: 0 }}
							onError={(e) => {
								// CSP / offline: drop the broken-image box, keep the login text.
								(e.currentTarget as HTMLImageElement).style.display = "none";
							}}
						/>
					)}
					<span
						style={{
							overflow: "hidden",
							textOverflow: "ellipsis",
							whiteSpace: "nowrap",
						}}
					>
						{user.login ? `@${user.login}` : user.name}
					</span>
				</button>
			)}
			<button
				type="button"
				onClick={() => setShowSettings(true)}
				title="Viewer settings"
				aria-label="Viewer settings"
				aria-haspopup="dialog"
				style={{
					display: "flex",
					alignItems: "center",
					justifyContent: "center",
					width: 32,
					height: 32,
					borderRadius: 6,
					background: "transparent",
					border: `1px solid ${theme.colors.border}`,
					color: theme.colors.text,
					cursor: "pointer",
					flexShrink: 0,
				}}
			>
				<Settings size={16} />
			</button>
			{/* Download app CTA — hidden for now, will come back later.
			<button
				type="button"
				onClick={onDownload}
				title="Download the Principal ADE desktop app"
				aria-label="Download app"
				style={{
					display: "flex",
					alignItems: "center",
					gap: 6,
					padding: "0 12px",
					height: 32,
					borderRadius: 6,
					fontSize: theme.fontSizes[1],
					fontWeight: 500,
					fontFamily: theme.fonts.body,
					background: theme.colors.primary,
					color: theme.colors.background,
					border: `1px solid ${theme.colors.primary}`,
					cursor: "pointer",
					flexShrink: 0,
				}}
			>
				<Download size={16} />
				<span>Download app</span>
			</button>
			*/}
		</header>
		{showServerSessions && createPortal(
			<ServerSessionsModal onClose={() => setShowServerSessions(false)} />,
			document.body,
		)}
		{showIdentityModal && user && createPortal(
			<IdentityModal user={user} onClose={() => setShowIdentityModal(false)} onOpenProfile={onOpenProfile} />,
			document.body,
		)}
		{showPending && createPortal(
			<PendingAnalysesModal
				analyses={pendingFull}
				discardingId={discardingId}
				onDiscard={discardAnalysis}
				onClose={() => setShowPending(false)}
			/>,
			document.body,
		)}
		{showFailures && createPortal(
			<FailuresModal
				analyses={failedFull}
				retryingId={retryingId}
				onRetry={retryAnalysis}
				onDelete={deleteAnalysis}
				onClose={() => setShowFailures(false)}
			/>,
			document.body,
		)}
		{showSettings && createPortal(
			<SettingsModal onClose={() => setShowSettings(false)} />,
			document.body,
		)}
		</>
	);
}

// ---------------------------------------------------------------------------
// IdentityModal — explains where the header's user identity came from. Opened by
// clicking the identity chip. Each source (gh CLI / TRAIL_GH_TOKEN / git config)
// gets a one-line provenance so people understand we read it locally and didn't
// phone home for it.
// ---------------------------------------------------------------------------

const GITHUB_SOURCE_COPY: Record<
	"gh" | "token",
	{ label: string; command: string; detail: string }
> = {
	gh: {
		label: "GitHub CLI",
		command: "gh api user",
		detail:
			"You're signed in to the GitHub CLI, so we asked it who you are. The login and avatar come straight from your GitHub account.",
	},
	token: {
		label: "GitHub token",
		command: "GET api.github.com/user",
		detail:
			"A GitHub token was provided to the viewer (TRAIL_GH_TOKEN). We used it to look up your account on GitHub for the login and avatar.",
	},
};

// One provenance card: an icon, a "Source: <label>" line with the exact command
// we ran, and a free-form detail/body below it.
function ProvenanceRow({
	icon: Icon,
	label,
	command,
	children,
}: {
	icon: typeof Terminal;
	label: string;
	command?: string;
	children: ReactNode;
}) {
	const { theme } = useTheme();
	const muted = theme.colors.textMuted ?? theme.colors.textSecondary;
	return (
		<div
			style={{
				display: "flex",
				alignItems: "flex-start",
				gap: 10,
				padding: "12px 14px",
				borderRadius: 8,
				background: theme.colors.background,
				border: `1px solid ${theme.colors.border}`,
				marginBottom: 12,
			}}
		>
			<span style={{ color: theme.colors.primary, flexShrink: 0, marginTop: 2 }}>
				<Icon size={18} />
			</span>
			<div style={{ minWidth: 0, flex: 1 }}>
				<div
					style={{
						display: "flex",
						alignItems: "center",
						gap: 8,
						marginBottom: 4,
						flexWrap: "wrap",
					}}
				>
					<span style={{ fontSize: theme.fontSizes[1], fontWeight: 600 }}>
						Source: {label}
					</span>
					{command && (
						<code
							style={{
								fontFamily: theme.fonts.monospace,
								fontSize: theme.fontSizes[0],
								color: muted,
								background: theme.colors.surface,
								border: `1px solid ${theme.colors.border}`,
								borderRadius: 4,
								padding: "1px 6px",
							}}
						>
							{command}
						</code>
					)}
				</div>
				<div style={{ fontSize: theme.fontSizes[0], color: muted, lineHeight: 1.5 }}>
					{children}
				</div>
			</div>
		</div>
	);
}

function IdentityModal({
	user,
	onClose,
	onOpenProfile,
}: {
	user: UserIdentity;
	onClose: () => void;
	onOpenProfile: () => void;
}) {
	const { theme } = useTheme();
	const muted = theme.colors.textMuted ?? theme.colors.textSecondary;
	// GitHub provenance shows when signed in (gh CLI / token). The local git
	// config row shows whenever it resolved — including alongside GitHub.
	const githubCopy =
		user.source === "gh" || user.source === "token"
			? GITHUB_SOURCE_COPY[user.source]
			: null;
	const githubIcon = user.source === "token" ? User : Terminal;

	return (
		<div
			role="dialog"
			aria-modal
			aria-label="About this identity"
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
					background: theme.colors.surface,
					border: `1px solid ${theme.colors.border}`,
					borderRadius: 12,
					padding: 24,
					boxShadow: "0 12px 48px rgba(0,0,0,0.4)",
					color: theme.colors.text,
				}}
			>
				{/* Identity header: avatar (or fallback glyph) + name/login. */}
				<div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
					{user.avatarUrl ? (
						<img
							src={user.avatarUrl}
							alt=""
							width={44}
							height={44}
							style={{ borderRadius: "50%", flexShrink: 0 }}
							onError={(e) => {
								(e.currentTarget as HTMLImageElement).style.display = "none";
							}}
						/>
					) : (
						<span
							style={{
								display: "flex",
								alignItems: "center",
								justifyContent: "center",
								width: 44,
								height: 44,
								borderRadius: "50%",
								background: theme.colors.background,
								border: `1px solid ${theme.colors.border}`,
								color: muted,
								flexShrink: 0,
							}}
						>
							<User size={22} />
						</span>
					)}
					<div style={{ minWidth: 0 }}>
						{user.name && (
							<div style={{ fontSize: theme.fontSizes[3], fontWeight: 700, lineHeight: 1.2 }}>
								{user.name}
							</div>
						)}
						{user.login && (
							<div style={{ fontSize: theme.fontSizes[1], color: muted }}>
								@{user.login}
							</div>
						)}
					</div>
				</div>

				{/* GitHub provenance — only when signed in. */}
				{githubCopy && (
					<ProvenanceRow
						icon={githubIcon}
						label={githubCopy.label}
						command={githubCopy.command}
					>
						{githubCopy.detail}
					</ProvenanceRow>
				)}

				{/* Local git config — shown whenever it resolved, even when GitHub
				    drove the chip, so people can see their commit identity too. */}
				{user.git && (
					<ProvenanceRow
						icon={GitBranch}
						label="Local git config"
						command="git config user.name / user.email"
					>
						<div style={{ marginBottom: user.git.name || user.git.email ? 6 : 0 }}>
							{githubCopy
								? "Your local commit identity for this repo. We read it even though you're signed in to GitHub, so you can see what your commits will be attributed to."
								: "No GitHub sign-in was found, so this is your commit identity from the repo's git config. Nothing left your machine."}
						</div>
						{(user.git.name || user.git.email) && (
							<div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
								{user.git.name && (
									<div>
										<span style={{ opacity: 0.7 }}>name </span>
										<span style={{ color: theme.colors.text }}>{user.git.name}</span>
									</div>
								)}
								{user.git.email && (
									<div>
										<span style={{ opacity: 0.7 }}>email </span>
										<span style={{ color: theme.colors.text }}>{user.git.email}</span>
									</div>
								)}
							</div>
						)}
					</ProvenanceRow>
				)}

				{/* Reassurance + how the fallback chain works. */}
				<div
					style={{
						display: "flex",
						alignItems: "flex-start",
						gap: 8,
						fontSize: theme.fontSizes[0],
						color: muted,
						lineHeight: 1.5,
						marginBottom: 20,
					}}
				>
					<span style={{ flexShrink: 0, marginTop: 1 }}>
						<Info size={14} />
					</span>
					<span>
						The header chip is labelled by the first available of: GitHub CLI →
						GitHub token → git config. Your local git identity is always read and
						shown here too. All of this is resolved on your machine — it isn't sent
						anywhere.
					</span>
				</div>

				<div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
					{user.htmlUrl && (
						<button
							type="button"
							onClick={onOpenProfile}
							style={{
								display: "flex",
								alignItems: "center",
								gap: 6,
								padding: "0 14px",
								height: 36,
								borderRadius: 6,
								fontSize: theme.fontSizes[1],
								fontWeight: 500,
								fontFamily: theme.fonts.body,
								background: "transparent",
								color: theme.colors.text,
								border: `1px solid ${theme.colors.border}`,
								cursor: "pointer",
							}}
						>
							<ExternalLink size={15} />
							<span>GitHub profile</span>
						</button>
					)}
					<button
						type="button"
						onClick={onClose}
						style={{
							padding: "0 14px",
							height: 36,
							borderRadius: 6,
							fontSize: theme.fontSizes[1],
							fontWeight: 500,
							fontFamily: theme.fonts.body,
							background: theme.colors.primary,
							color: theme.colors.background,
							border: `1px solid ${theme.colors.primary}`,
							cursor: "pointer",
						}}
					>
						Done
					</button>
				</div>
			</div>
		</div>
	);
}
