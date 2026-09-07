/**
 * TrailHeader — mirrors web-ade's `src/components/trail/TrailHeader.tsx`
 * chrome (Principal AI brand + owner/repo crumbs + Share With Agent + GitHub)
 * adapted for the standalone viewer: no router, no sign-in slot, no centered
 * status, and the GitHub link only renders when the trail carries a remote
 * (local-only trails would have nothing to point at).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Link, Loader2, Share2, Terminal } from "lucide-react";
import { useTheme } from "@principal-ade/industry-theme";
import { electrobun, refreshLibrary } from "../rpc";

// lucide-react v1 dropped its brand icons (including `Github`), so we carry the
// GitHub mark inline. Single-path octocat glyph, currentColor-tinted like the
// lucide icons it sits beside. Exported because the TourHeader renders the same
// mark for its GitHub link.
export function GithubMark({ size = 20 }: { size?: number }) {
	return (
		<svg
			width={size}
			height={size}
			viewBox="0 0 24 24"
			fill="currentColor"
			aria-hidden
		>
			<path d="M12 .5C5.37.5 0 5.87 0 12.5c0 5.3 3.44 9.8 8.21 11.39.6.11.82-.26.82-.58 0-.29-.01-1.04-.02-2.04-3.34.72-4.04-1.61-4.04-1.61-.55-1.39-1.33-1.76-1.33-1.76-1.09-.74.08-.73.08-.73 1.2.09 1.84 1.24 1.84 1.24 1.07 1.83 2.81 1.3 3.49.99.11-.78.42-1.3.76-1.6-2.67-.3-5.47-1.33-5.47-5.93 0-1.31.47-2.38 1.24-3.22-.13-.3-.54-1.52.12-3.18 0 0 1.01-.32 3.3 1.23a11.5 11.5 0 0 1 6.01 0c2.29-1.55 3.3-1.23 3.3-1.23.66 1.66.25 2.88.12 3.18.77.84 1.23 1.91 1.23 3.22 0 4.61-2.8 5.62-5.48 5.92.43.37.81 1.1.81 2.22 0 1.6-.01 2.89-.01 3.28 0 .32.21.7.82.58A12.01 12.01 0 0 0 24 12.5C24 5.87 18.63.5 12 .5z" />
		</svg>
	);
}

const COPY_FEEDBACK_MS = 1500;
const WEB_ADE_BASE = "https://app.principal-ade.com";
const buildAgentCommand = (shareId: string) =>
	`npx -y @principal-ai/principal-studio-cli@latest trail ${shareId}`;

export function TrailHeader({
	tabId,
	owner,
	repo,
	share,
	githubUrl,
}: {
	tabId: string;
	owner: string;
	repo: string;
	/** When set, the trail has been published and the header swaps to share-mode
	 *  chrome (agent-copy + external links). When absent, the header shows a
	 *  Share button that publishes via the bun-side `shareTrail` RPC. */
	share?: { id: string };
	githubUrl?: string;
}) {
	const { theme } = useTheme();
	// Local override so a successful publish flips the chrome immediately without
	// waiting for the parent to refetch the payload. The bun side has already
	// persisted `share: { id }` to disk, so the next tab open mirrors this.
	const [optimisticShare, setOptimisticShare] = useState<{ id: string } | null>(null);
	const [shareError, setShareError] = useState<string | null>(null);
	const [sharing, setSharing] = useState(false);
	const [copied, setCopied] = useState(false);
	const [linkCopied, setLinkCopied] = useState(false);
	// Opens once on a successful publish to confirm + offer the share link.
	const [showPublishedModal, setShowPublishedModal] = useState(false);
	const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const linkTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const errorTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	const effectiveShare = optimisticShare ?? share;

	useEffect(
		() => () => {
			if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
			if (linkTimeoutRef.current) clearTimeout(linkTimeoutRef.current);
			if (errorTimeoutRef.current) clearTimeout(errorTimeoutRef.current);
		},
		[],
	);

	const onShare = useCallback(async () => {
		if (sharing) return;
		setSharing(true);
		setShareError(null);
		try {
			const res = await electrobun.rpc!.request.shareTrail({ tabId });
			if (!res.ok || !res.shareId) {
				const msg = res.error ?? "Publish failed";
				setShareError(msg);
				if (errorTimeoutRef.current) clearTimeout(errorTimeoutRef.current);
				errorTimeoutRef.current = setTimeout(() => setShareError(null), 6000);
				return;
			}
			setOptimisticShare({ id: res.shareId });
			setShowPublishedModal(true);
			// Flip the library tab's Draft badge to Published without a manual refresh.
			refreshLibrary();
		} catch (err) {
			setShareError(err instanceof Error ? err.message : String(err));
		} finally {
			setSharing(false);
		}
	}, [tabId, sharing]);

	const onCopyAgent = useCallback(async () => {
		if (!effectiveShare) return;
		try {
			await navigator.clipboard.writeText(buildAgentCommand(effectiveShare.id));
			setCopied(true);
			if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
			copyTimeoutRef.current = setTimeout(() => setCopied(false), COPY_FEEDBACK_MS);
		} catch {
			// clipboard may be denied — fail quietly
		}
	}, [effectiveShare]);

	const onOpenGithub = useCallback(() => {
		if (!githubUrl) return;
		void electrobun.rpc!.request.openExternal({ url: githubUrl });
	}, [githubUrl]);

	const onCopyLink = useCallback(async () => {
		if (!effectiveShare) return;
		try {
			await navigator.clipboard.writeText(
				`${WEB_ADE_BASE}/trail/${effectiveShare.id}`,
			);
			setLinkCopied(true);
			if (linkTimeoutRef.current) clearTimeout(linkTimeoutRef.current);
			linkTimeoutRef.current = setTimeout(() => setLinkCopied(false), COPY_FEEDBACK_MS);
		} catch {
			// clipboard may be denied — fail quietly
		}
	}, [effectiveShare]);

	const shareUrl = effectiveShare
		? `${WEB_ADE_BASE}/trail/${effectiveShare.id}`
		: "";

	return (
		<>
		<header
			style={{
				display: "flex",
				alignItems: "center",
				gap: 8,
				padding: "8px 16px",
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
					gap: 8,
					minWidth: 0,
					flex: 1,
				}}
			>
				<span
					style={{
						flexShrink: 0,
						fontSize: theme.fontSizes[0],
						fontWeight: 600,
						letterSpacing: 0.3,
						textTransform: "uppercase",
						padding: "2px 7px",
						borderRadius: 999,
						...(effectiveShare
							? {
									background: theme.colors.accent ?? theme.colors.primary,
									color: theme.colors.background,
								}
							: {
									background: "transparent",
									color: theme.colors.textMuted ?? theme.colors.textSecondary,
									border: `1px solid ${theme.colors.border ?? "#333"}`,
								}),
					}}
				>
					{effectiveShare ? "Published" : "Draft"}
				</span>
				<span
					style={{
						fontSize: theme.fontSizes[1],
						fontWeight: 600,
						color: theme.colors.text,
						overflow: "hidden",
						textOverflow: "ellipsis",
						whiteSpace: "nowrap",
					}}
				>
					{owner}
				</span>
				<span style={{ color: theme.colors.textMuted }} aria-hidden>
					/
				</span>
				<span
					style={{
						fontSize: theme.fontSizes[1],
						fontWeight: 600,
						color: theme.colors.text,
						overflow: "hidden",
						textOverflow: "ellipsis",
						whiteSpace: "nowrap",
					}}
				>
					{repo}
				</span>
				{shareError && (
					<span
						style={{
							marginLeft: 12,
							fontSize: theme.fontSizes[0],
							color: theme.colors.error ?? "#ff6b6b",
							overflow: "hidden",
							textOverflow: "ellipsis",
							whiteSpace: "nowrap",
							maxWidth: 480,
						}}
						title={shareError}
					>
						{shareError}
					</span>
				)}
			</div>

			<div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
				{!effectiveShare ? (
					<button
						type="button"
						onClick={onShare}
						disabled={sharing}
						title="Publish this trail to web-ade so it can be shared as a link"
						aria-label="Publish trail"
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
							cursor: sharing ? "wait" : "pointer",
							opacity: sharing ? 0.7 : 1,
						}}
					>
						{sharing ? (
							<Loader2 size={16} className="principal-studio-spin" />
						) : (
							<Share2 size={16} />
						)}
						<span>{sharing ? "Publishing…" : "Publish"}</span>
					</button>
				) : (
					<>
						<button
							type="button"
							onClick={onCopyAgent}
							title={`Copies: ${buildAgentCommand(effectiveShare.id)}`}
							aria-label="Copy CLI command for agents"
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
								background: copied ? theme.colors.primary : "transparent",
								color: copied ? theme.colors.background : theme.colors.text,
								border: `1px solid ${copied ? theme.colors.primary : theme.colors.border}`,
								cursor: "pointer",
							}}
						>
							{copied ? <Check size={16} /> : <Terminal size={16} />}
							<span>{copied ? "Copied" : "Share With Agent"}</span>
						</button>
						<button
							type="button"
							onClick={onCopyLink}
							title="Copy the web-ade share link to the clipboard"
							aria-label="Copy share link"
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
								background: linkCopied ? theme.colors.primary : "transparent",
								color: linkCopied ? theme.colors.background : theme.colors.text,
								border: `1px solid ${linkCopied ? theme.colors.primary : theme.colors.border}`,
								cursor: "pointer",
							}}
						>
							{linkCopied ? <Check size={16} /> : <Link size={16} />}
							<span>{linkCopied ? "Copied" : "Copy link"}</span>
						</button>
					</>
				)}
				{githubUrl && (
					<button
						type="button"
						onClick={onOpenGithub}
						title={`Open ${owner}/${repo} on GitHub`}
						aria-label={`Open ${owner}/${repo} on GitHub`}
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
						}}
					>
						<GithubMark size={20} />
					</button>
				)}
			</div>
		</header>
		{showPublishedModal && effectiveShare && createPortal(
			<div
				role="dialog"
				aria-modal
				aria-label="Trail published"
				onClick={() => setShowPublishedModal(false)}
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
						width: "min(520px, calc(100vw - 48px))",
						background: theme.colors.surface,
						border: `1px solid ${theme.colors.border}`,
						borderRadius: 12,
						padding: 24,
						boxShadow: "0 12px 48px rgba(0,0,0,0.4)",
						color: theme.colors.text,
					}}
				>
					<div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
						<span
							style={{
								display: "flex",
								alignItems: "center",
								justifyContent: "center",
								width: 28,
								height: 28,
								borderRadius: "50%",
								background: theme.colors.primary,
								color: theme.colors.background,
								flexShrink: 0,
							}}
						>
							<Check size={18} />
						</span>
						<span style={{ fontSize: theme.fontSizes[3], fontWeight: 700 }}>Trail published</span>
					</div>
					<div
						style={{
							fontSize: theme.fontSizes[1],
							color: theme.colors.textMuted ?? theme.colors.textSecondary,
							marginBottom: 16,
						}}
					>
						Your trail is live on web-ade. Share this link so anyone can open it.
					</div>
					<div
						style={{
							fontSize: theme.fontSizes[0],
							fontFamily: theme.fonts.monospace,
							color: theme.colors.text,
							background: theme.colors.background,
							border: `1px solid ${theme.colors.border}`,
							borderRadius: 6,
							padding: "10px 12px",
							marginBottom: 16,
							overflowX: "auto",
							whiteSpace: "nowrap",
							userSelect: "all",
						}}
					>
						{shareUrl}
					</div>
					<div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
						<button
							type="button"
							onClick={() => setShowPublishedModal(false)}
							style={{
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
							Done
						</button>
						<button
							type="button"
							onClick={onCopyLink}
							style={{
								display: "flex",
								alignItems: "center",
								gap: 6,
								padding: "0 14px",
								height: 36,
								borderRadius: 6,
								fontSize: theme.fontSizes[1],
								fontWeight: 600,
								fontFamily: theme.fonts.body,
								background: theme.colors.primary,
								color: theme.colors.background,
								border: `0.5px solid ${theme.colors.primary}`,
								cursor: "pointer",
							}}
						>
							{linkCopied ? <Check size={16} /> : <Link size={16} />}
							<span>{linkCopied ? "Copied" : "Copy link"}</span>
						</button>
					</div>
				</div>
			</div>,
			document.body,
		)}
		</>
	);
}
