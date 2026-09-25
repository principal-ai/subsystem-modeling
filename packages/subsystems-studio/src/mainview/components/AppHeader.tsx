/**
 * AppHeader — persistent app chrome above the tab strip. Carries the Principal
 * AI brand (moved up out of the per-tab chrome so it shows on every tab,
 * including the library) and the Download app CTA. Plus the IdentityModal it
 * portals (clicking the identity chip explains where the name/avatar came from
 * rather than jumping straight to GitHub).
 */

import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import {
	Download,
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
	StudioVersionStatus,
	UserIdentity,
} from "../../shared/contract";
import {
	electrobun,
	refreshLibrary,
	studioVersionChangeSubscribers,
} from "../rpc";
import { IntegrationLogos } from "./IntegrationTools";
import { SettingsModal } from "./SettingsModal";

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

	// Clicking the identity chip explains where the name/avatar came from rather
	// than jumping straight to GitHub — the profile link lives inside the modal.
	const [showIdentityModal, setShowIdentityModal] = useState(false);

	// Header Settings gear — toggles which permanent tabs show by default.
	const [showSettings, setShowSettings] = useState(false);

	// Studio self-update — npm latest vs installed; button only when a newer
	// published build is available (hidden for source checkouts).
	const [studioVersion, setStudioVersion] = useState<StudioVersionStatus | null>(
		null,
	);
	const [studioUpdateBusy, setStudioUpdateBusy] = useState(false);
	const [studioUpdateError, setStudioUpdateError] = useState<string | null>(null);
	useEffect(() => {
		let alive = true;
		void electrobun.rpc!.request
			.getStudioVersionStatus({ detailed: true })
			.then((s) => {
				if (alive) setStudioVersion(s);
			})
			.catch(() => {
				/* best-effort */
			});
		const onPush = (payload: { status: StudioVersionStatus; error?: string }) => {
			setStudioVersion(payload.status);
			if (payload.error) setStudioUpdateError(payload.error);
		};
		studioVersionChangeSubscribers.add(onPush);
		return () => {
			alive = false;
			studioVersionChangeSubscribers.delete(onPush);
		};
	}, []);

	const showStudioUpdate =
		studioVersion?.updateAvailable === true &&
		studioVersion.channel !== "source" &&
		!studioUpdateBusy;

	const onUpdateStudio = useCallback(async () => {
		setStudioUpdateBusy(true);
		setStudioUpdateError(null);
		try {
			const res = await electrobun.rpc!.request.updateStudio({});
			if (!res.ok) {
				setStudioUpdateError(res.error ?? "Update failed");
				setStudioUpdateBusy(false);
				if (res.status) setStudioVersion(res.status);
				return;
			}
			if (res.status) setStudioVersion(res.status);
			// Host exits + relaunches; keep busy until the window closes.
		} catch (err) {
			setStudioUpdateError(err instanceof Error ? err.message : String(err));
			setStudioUpdateBusy(false);
		}
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
					title="Refresh tour library"
					aria-label="Refresh tour library"
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
						borderRadius: 6,
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
			{(showStudioUpdate || studioUpdateBusy) && (
				<button
					type="button"
					onClick={() => void onUpdateStudio()}
					disabled={studioUpdateBusy}
					title={
						studioUpdateError
							? studioUpdateError
							: studioVersion?.latestVersion
								? `Update Subsystems Studio to ${studioVersion.latestVersion} (currently ${studioVersion.installedVersion ?? "unknown"})`
								: "Update Subsystems Studio"
					}
					aria-label={
						studioVersion?.latestVersion
							? `Update to version ${studioVersion.latestVersion}`
							: "Update Subsystems Studio"
					}
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
						cursor: studioUpdateBusy ? "wait" : "pointer",
						flexShrink: 0,
						opacity: studioUpdateBusy ? 0.85 : 1,
					}}
				>
					{studioUpdateBusy ? (
						<Loader2 size={16} className="principal-studio-spin" />
					) : (
						<Download size={16} />
					)}
					<span>
						{studioUpdateBusy
							? "Updating…"
							: studioVersion?.latestVersion
								? `Update to ${studioVersion.latestVersion}`
								: "Update"}
					</span>
				</button>
			)}
			{/* Graphify + OpenCode logo buttons — install status, updates, usage. */}
			<IntegrationLogos />
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
		{showIdentityModal && user && createPortal(
			<IdentityModal user={user} onClose={() => setShowIdentityModal(false)} onOpenProfile={onOpenProfile} />,
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

export function IdentityModal({
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
