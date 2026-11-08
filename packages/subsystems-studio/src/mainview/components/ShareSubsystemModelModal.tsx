import { useEffect, useState, type CSSProperties } from "react";
import { Check, FileText, Share2 } from "lucide-react";
import { useTheme } from "@principal-ade/industry-theme";
import { electrobun } from "../rpc";
import { GithubMark } from "./GithubMark";
import { Modal, ModalBody, ModalButton, ModalFooter, ModalHeader } from "./Modal";

/** Host-owned share dialog used by both subsystem and C4 model headers. */
export function ShareSubsystemModelModal({
	graphId,
	title,
	hasGist,
	onClose,
}: {
	graphId: string;
	title: string;
	hasGist: boolean;
	onClose: () => void;
}) {
	const { theme } = useTheme();
	const [busyAction, setBusyAction] = useState<"gist" | "path" | null>(null);
	const [gistError, setGistError] = useState<string | null>(null);
	const [locationError, setLocationError] = useState<string | null>(null);
	const [locationPath, setLocationPath] = useState<string | null>(null);
	const [locationCopied, setLocationCopied] = useState(false);
	const [gistLinkCopied, setGistLinkCopied] = useState(false);
	const [gistResult, setGistResult] = useState<{
		url?: string;
		created: boolean;
	} | null>(null);
	const busy = busyAction !== null;
	const dismissAfterCopyFeedback = async () => {
		await new Promise<void>((resolve) => window.setTimeout(resolve, 500));
		onClose();
	};

	useEffect(() => {
		let cancelled = false;
		setLocationPath(null);
		setLocationError(null);
		setLocationCopied(false);
		void electrobun.rpc!.request.getSubsystemModelPath({ graphId }).then(
			(response) => {
				if (cancelled) return;
				if (!response.ok || !response.path) {
					setLocationError(response.error ?? "Could not get the model location");
					return;
				}
				setLocationPath(response.path);
			},
			(err: unknown) => {
				if (!cancelled) {
					setLocationError(err instanceof Error ? err.message : "Could not get the model location");
				}
			},
		);
		return () => {
			cancelled = true;
		};
	}, [graphId]);

	const copyLocation = async () => {
		if (!locationPath) return;
		setBusyAction("path");
		setLocationError(null);
		setLocationCopied(false);
		try {
			const response = await electrobun.rpc!.request.writeClipboard({ text: locationPath });
			if (!response.ok) {
				setLocationError(response.error ?? "Could not copy the model location");
				return;
			}
			setLocationCopied(true);
			await dismissAfterCopyFeedback();
		} catch (err) {
			setLocationError(err instanceof Error ? err.message : "Could not copy the model location");
		} finally {
			setBusyAction(null);
		}
	};

	const share = async () => {
		setBusyAction("gist");
		setGistError(null);
		setGistLinkCopied(false);
		try {
			const response = await electrobun.rpc!.request.shareSubsystemModelAsGist({ graphId });
			if (!response.ok) {
				setGistError(response.error ?? "Failed to share as gist");
				return;
			}
			const url = response.viewUrl ?? response.gistUrl;
			setGistResult({ url, created: response.created === true });
			if (url) {
				const copied = await electrobun.rpc!.request.writeClipboard({ text: url });
				if (!copied.ok) {
					setGistError(copied.error ?? "Could not copy the gist link");
				} else {
					setGistLinkCopied(true);
					await dismissAfterCopyFeedback();
				}
			}
		} catch (err) {
			setGistError(err instanceof Error ? err.message : "Failed to share as gist");
		} finally {
			setBusyAction(null);
		}
	};

	const optionStyle = {
		display: "flex",
		alignItems: "flex-start",
		gap: 12,
		padding: 14,
		border: `1px solid ${theme.colors.border}`,
		borderRadius: 8,
		background: theme.colors.background,
	};
	const iconStyle = { flexShrink: 0, color: theme.colors.textSecondary };
	const optionButtonStyle: CSSProperties & {
		"--share-option-hover-background": string;
		"--share-option-hover-border": string;
	} = {
		...optionStyle,
		alignItems: "center",
		width: "100%",
		textAlign: "left" as const,
		fontFamily: theme.fonts.body,
		fontSize: theme.fontSizes[1],
		color: theme.colors.text,
		cursor: "pointer",
		appearance: "none" as const,
		"--share-option-hover-background": `color-mix(in srgb, ${theme.colors.primary} 8%, ${theme.colors.background})`,
		"--share-option-hover-border": theme.colors.primary,
		transition: "background-color 120ms ease, border-color 120ms ease",
	};

	return (
		<Modal ariaLabel={`Share ${title}`} width={560} onClose={busy ? undefined : onClose}>
			<ModalHeader
				icon={Share2}
				title="Share Subsystem Model"
				onClose={onClose}
				closeDisabled={busy}
			/>
			<ModalBody>
				<div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
					<button
						type="button"
						aria-labelledby="local-path-title"
						aria-label={locationCopied ? "Local file path copied" : "Copy local file path"}
						disabled={!locationPath || busy}
						onClick={() => void copyLocation()}
						className="share-option-button"
						style={optionButtonStyle}
					>
						{locationCopied ? <Check size={18} style={iconStyle} aria-hidden="true" /> : <FileText size={18} style={iconStyle} aria-hidden="true" />}
						<div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 8 }}>
							<h3 id="local-path-title" style={{ margin: 0, fontSize: theme.fontSizes[2] }}>{locationCopied ? "Copied to Clipboard" : "Copy File Path"}</h3>
							{locationError && <div role="alert" style={{ color: theme.colors.error ?? "#e5534b" }}>{locationError}</div>}
						</div>
					</button>

					<button
						type="button"
						aria-labelledby="share-public-gist-title"
						aria-label={gistLinkCopied ? "Public gist created and link copied" : hasGist ? "Update public gist" : "Create public gist"}
						disabled={busy}
						onClick={() => void share()}
						className="share-option-button"
						style={optionButtonStyle}
					>
						<div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 8 }}>
							<div style={{ display: "flex", alignItems: "center", gap: 12 }}>
								<span style={{ ...iconStyle, display: "flex" }}>{gistLinkCopied ? <Check size={18} /> : <GithubMark size={18} />}</span>
								<h3 id="share-public-gist-title" style={{ margin: 0, fontSize: theme.fontSizes[2] }}>{gistLinkCopied ? "Copied to Clipboard" : hasGist ? "Update public gist" : "Create public gist"}</h3>
							</div>
							{gistResult && (
								<>
									<div role="status" style={{ color: theme.colors.textSecondary }}>
										{gistResult.created ? "Public gist created." : "Public gist updated."}
									</div>
									{gistResult.url ? (
										<>
											<span style={{ width: "100%", boxSizing: "border-box", fontFamily: theme.fonts.monospace, overflowWrap: "anywhere", userSelect: "text", cursor: "text", padding: "6px 8px", borderRadius: 6, background: theme.colors.backgroundSecondary ?? theme.colors.background, border: `1px solid ${theme.colors.border}` }}>
												{gistResult.url}
											</span>
										</>
									) : null}
								</>
							)}
							{gistError && <div role="alert" style={{ color: theme.colors.error ?? "#e5534b" }}>{gistError}</div>}
						</div>
					</button>
				</div>
			</ModalBody>
			<ModalFooter>
				<ModalButton variant="primary" disabled={busy} onClick={onClose}>Done</ModalButton>
			</ModalFooter>
		</Modal>
	);
}
