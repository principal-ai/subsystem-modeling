import { useState } from "react";
import { Check, Copy, FileText, Share2 } from "lucide-react";
import { useTheme } from "@principal-ade/industry-theme";
import { electrobun } from "../rpc";
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
	const [busyAction, setBusyAction] = useState<"gist" | "location" | null>(null);
	const [gistError, setGistError] = useState<string | null>(null);
	const [locationError, setLocationError] = useState<string | null>(null);
	const [locationCopied, setLocationCopied] = useState(false);
	const [gistResult, setGistResult] = useState<{
		url?: string;
		created: boolean;
		linkCopied: boolean;
	} | null>(null);
	const busy = busyAction !== null;

	const copyLocation = async () => {
		setBusyAction("location");
		setLocationError(null);
		try {
			const response = await electrobun.rpc!.request.getSubsystemModelPath({ graphId });
			if (!response.ok || !response.path) {
				setLocationError(response.error ?? "Could not get the model location");
				return;
			}
			await navigator.clipboard.writeText(response.path);
			setLocationCopied(true);
		} catch (err) {
			setLocationError(err instanceof Error ? err.message : "Could not copy the model location");
		} finally {
			setBusyAction(null);
		}
	};

	const share = async () => {
		setBusyAction("gist");
		setGistError(null);
		try {
			const response = await electrobun.rpc!.request.shareSubsystemModelAsGist({ graphId });
			if (!response.ok) {
				setGistError(response.error ?? "Failed to share as gist");
				return;
			}
			const url = response.viewUrl ?? response.gistUrl;
			let linkCopied = false;
			if (url) {
				try {
					await navigator.clipboard.writeText(url);
					linkCopied = true;
				} catch {
					// The visible link can still be selected and copied manually.
				}
			}
			setGistResult({ url, created: response.created === true, linkCopied });
		} catch (err) {
			setGistError(err instanceof Error ? err.message : "Failed to share as gist");
		} finally {
			setBusyAction(null);
		}
	};

	const copyGistLink = async () => {
		if (!gistResult?.url) return;
		try {
			await navigator.clipboard.writeText(gistResult.url);
			setGistResult({ ...gistResult, linkCopied: true });
		} catch (err) {
			setGistError(err instanceof Error ? err.message : "Could not copy the gist link");
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
	const iconStyle = { flexShrink: 0, color: theme.colors.textSecondary, marginTop: 2 };

	return (
		<Modal ariaLabel={`Share ${title}`} width={560} onClose={busy ? undefined : onClose}>
			<ModalHeader
				icon={Share2}
				title={<>Share <strong>{title}</strong></>}
				onClose={busy ? undefined : onClose}
			/>
			<ModalBody>
				<div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
					<section style={optionStyle} aria-labelledby="copy-local-path-title">
						<FileText size={18} style={iconStyle} aria-hidden="true" />
						<div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 8 }}>
							<div>
								<h3 id="copy-local-path-title" style={{ margin: "0 0 4px", fontSize: theme.fontSizes[2] }}>Local file path</h3>
								<div style={{ color: theme.colors.textSecondary }}>
									Copy the JSON file location on this computer. It is not a link others can open.
								</div>
							</div>
							{locationCopied && <div role="status" style={{ color: theme.colors.textSecondary }}>File path copied to clipboard.</div>}
							{locationError && <div role="alert" style={{ color: theme.colors.error ?? "#e5534b" }}>{locationError}</div>}
							<ModalButton icon={locationCopied ? Check : Copy} busy={busyAction === "location"} disabled={busy && busyAction !== "location"} onClick={() => void copyLocation()}>
								{locationCopied ? "Copy path again" : "Copy file path"}
							</ModalButton>
						</div>
					</section>

					<section style={optionStyle} aria-labelledby="share-public-gist-title">
						<Share2 size={18} style={iconStyle} aria-hidden="true" />
						<div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 8 }}>
							<div>
								<h3 id="share-public-gist-title" style={{ margin: "0 0 4px", fontSize: theme.fontSizes[2] }}>Public GitHub gist</h3>
								<div style={{ color: theme.colors.textSecondary }}>
									{hasGist ? "Update the public gist and copy its link so others can view this model." : "Create a public gist and copy its link so others can view this model."}
								</div>
							</div>
							{gistResult && (
								<>
									<div role="status" style={{ color: theme.colors.textSecondary }}>
										{gistResult.created ? "Public gist created." : "Public gist updated."}
									</div>
									{gistResult.url ? (
										<>
											<code style={{ width: "100%", boxSizing: "border-box", fontFamily: theme.fonts.monospace, overflowWrap: "anywhere", padding: "6px 8px", borderRadius: 6, background: theme.colors.backgroundSecondary ?? theme.colors.background, border: `1px solid ${theme.colors.border}` }}>
												{gistResult.url}
											</code>
											<div style={{ color: theme.colors.textSecondary }}>
												{gistResult.linkCopied ? "Link copied to clipboard." : "Select and copy the link above, or use Copy gist link."}
											</div>
										</>
									) : null}
								</>
							)}
							{gistError && <div role="alert" style={{ color: theme.colors.error ?? "#e5534b" }}>{gistError}</div>}
							<div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
								<ModalButton variant="primary" icon={Share2} busy={busyAction === "gist"} disabled={busy && busyAction !== "gist"} onClick={() => void share()}>
									{gistResult ? "Share again" : hasGist ? "Update gist" : "Create public gist"}
								</ModalButton>
								{gistResult?.url && (
									<ModalButton icon={gistResult.linkCopied ? Check : Copy} onClick={() => void copyGistLink()}>
										{gistResult.linkCopied ? "Link copied" : "Copy gist link"}
									</ModalButton>
								)}
							</div>
						</div>
					</section>
				</div>
			</ModalBody>
			<ModalFooter>
				<ModalButton variant="primary" disabled={busy} onClick={onClose}>Done</ModalButton>
			</ModalFooter>
		</Modal>
	);
}
