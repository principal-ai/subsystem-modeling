/**
 * Review agent-proposed subsystem model corrections (before/after + why).
 * Accept applies the patch; reject leaves the model unchanged.
 *
 * The modal owns the proposal collection and all list state; each row is a
 * `ProposalCard` (its own module so a single card can render standalone).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useTheme } from "@principal-ade/industry-theme";
import type {
	SubsystemModelProposal,
	SubsystemVerificationLane,
} from "../../shared/contract";
import type { SubsystemComponent } from "@principal-ai/subsystems-react";
import { electrobun } from "../rpc";
import { Modal, ModalBody, ModalHeader } from "./Modal";
import {
	ProposalCard,
	buildAgentPrompt,
	proposalComponentAlias,
} from "./ProposalCard";

const COPY_FEEDBACK_MS = 1500;

export function ProposalsModal({
	graphId,
	title,
	lane,
	onClose,
}: {
	graphId: string;
	title?: string;
	/** Show only proposals in this verification lane (all lanes when unset). */
	lane?: SubsystemVerificationLane;
	onClose: () => void;
}) {
	const { theme } = useTheme();
	const muted = theme.colors.textMuted ?? theme.colors.textSecondary;
	const [proposals, setProposals] = useState<SubsystemModelProposal[] | null>(
		null,
	);
	const [error, setError] = useState<string | null>(null);
	// Model components by alias — powers the node preview next to a proposal.
	const [componentsByAlias, setComponentsByAlias] = useState<
		Map<string, SubsystemComponent> | null
	>(null);
	// Per-card busy state so acting on one proposal never clears another's
	// in-flight indicator.
	const [busy, setBusy] = useState<
		Record<string, "accept" | "reject" | "scoring">
	>({});
	const [notice, setNotice] = useState<
		{ kind: "accepted" | "rejected"; changeCount: number } | null
	>(null);
	const [copiedId, setCopiedId] = useState<string | null>(null);
	const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

	// Escape dismisses the modal.
	useEffect(() => {
		const onKeyDown = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				e.preventDefault();
				onClose();
			}
		};
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [onClose]);

	const onCopyForAgent = useCallback(
		async (p: SubsystemModelProposal) => {
			try {
				await navigator.clipboard.writeText(buildAgentPrompt(p, title));
				setCopiedId(p.id);
				if (copyTimer.current) clearTimeout(copyTimer.current);
				copyTimer.current = setTimeout(
					() => setCopiedId(null),
					COPY_FEEDBACK_MS,
				);
			} catch {
				// clipboard may be denied — fail quietly
			}
		},
		[title],
	);

	const refresh = useCallback(async () => {
		try {
			const res = await electrobun.rpc!.request.listSubsystemModelProposals({
				graphId,
				includeResolved: false,
			});
			if (!res.ok) {
				setError(res.error ?? "Failed to load proposals");
				setProposals([]);
				return [];
			}
			setError(null);
			const next = res.proposals ?? [];
			setProposals(next);
			return next;
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
			setProposals([]);
			return [];
		}
	}, [graphId]);

	/** Load the model once so a construct proposal can render its node. */
	const loadModel = useCallback(async () => {
		try {
			const res = await electrobun.rpc!.request.getSubsystemModel({ graphId });
			if (!res.ok || !res.graph) return;
			const map = new Map<string, SubsystemComponent>();
			for (const c of res.graph.components ?? []) map.set(c.alias, c);
			setComponentsByAlias(map);
		} catch {
			// Preview only — a missing model just hides the node.
		}
	}, [graphId]);

	useEffect(() => {
		void refresh();
		void loadModel();
	}, [refresh, loadModel]);

	useEffect(() => {
		return () => {
			if (closeTimer.current) clearTimeout(closeTimer.current);
			if (copyTimer.current) clearTimeout(copyTimer.current);
		};
	}, []);

	const scheduleClose = useCallback(
		(delayMs: number) => {
			if (closeTimer.current) clearTimeout(closeTimer.current);
			closeTimer.current = setTimeout(onClose, delayMs);
		},
		[onClose],
	);

	const onAccept = useCallback(
		async (proposalId: string) => {
			const target = proposals?.find((p) => p.id === proposalId);
			const changeCount = target?.changes.length ?? target?.preview.length ?? 0;
			setBusy((prev) => ({ ...prev, [proposalId]: "accept" }));
			setNotice(null);
			setProposals((prev) => (prev ?? []).filter((p) => p.id !== proposalId));
			try {
				const res = await electrobun.rpc!.request.acceptSubsystemModelProposal({
					graphId,
					proposalId,
				});
				if (!res.ok) {
					const alreadyResolved =
						typeof res.error === "string" &&
						res.error.startsWith("proposal is already ");
					if (!alreadyResolved) {
						setError(res.error ?? "Accept failed");
						setProposals((prev) => {
							if (!target) return prev;
							const next = (prev ?? []).filter((p) => p.id !== proposalId);
							return [target, ...next];
						});
						return;
					}
				}
				const applied = res.proposal?.changes.length ?? changeCount;
				setNotice({ kind: "accepted", changeCount: applied });
				const remaining = await refresh();
				if (remaining.length === 0) scheduleClose(1600);
			} catch (err) {
				setError(err instanceof Error ? err.message : String(err));
				setProposals((prev) => {
					if (!target) return prev;
					const next = (prev ?? []).filter((p) => p.id !== proposalId);
					return [target, ...next];
				});
			} finally {
				setBusy((prev) => {
					const next = { ...prev };
					delete next[proposalId];
					return next;
				});
			}
		},
		[graphId, proposals, refresh, scheduleClose],
	);

	const onReject = useCallback(
		async (proposalId: string) => {
			const target = proposals?.find((p) => p.id === proposalId);
			const changeCount = target?.changes.length ?? target?.preview.length ?? 0;
			setBusy((prev) => ({ ...prev, [proposalId]: "reject" }));
			setNotice(null);
			try {
				const res = await electrobun.rpc!.request.rejectSubsystemModelProposal({
					graphId,
					proposalId,
				});
				if (!res.ok) {
					const alreadyResolved =
						typeof res.error === "string" &&
						res.error.startsWith("proposal is already ");
					if (!alreadyResolved) {
						setError(res.error ?? "Reject failed");
						return;
					}
				}
				const discarded = res.proposal?.changes.length ?? changeCount;
				setNotice({ kind: "rejected", changeCount: discarded });
				const remaining = await refresh();
				if (remaining.length === 0) scheduleClose(1600);
			} catch (err) {
				setError(err instanceof Error ? err.message : String(err));
			} finally {
				setBusy((prev) => {
					const next = { ...prev };
					delete next[proposalId];
					return next;
				});
			}
		},
		[graphId, proposals, refresh, scheduleClose],
	);

	const onScore = useCallback(
		async (proposalId: string, force?: boolean) => {
			setBusy((prev) => ({ ...prev, [proposalId]: "scoring" }));
			setError(null);
			try {
				const res = await electrobun.rpc!.request.scoreSubsystemModelProposal({
					graphId,
					proposalId,
					force,
				});
				if (!res.ok) {
					setError(res.error ?? "Second-opinion scoring failed");
					return;
				}
				await refresh();
			} catch (err) {
				setError(err instanceof Error ? err.message : String(err));
			} finally {
				setBusy((prev) => {
					const next = { ...prev };
					delete next[proposalId];
					return next;
				});
			}
		},
		[graphId, refresh],
	);

	// Lane-scoped view (when opened from a lane badge), otherwise all proposals.
	const shown = (proposals ?? []).filter((p) => !lane || p.lane === lane);

	return (
		<Modal ariaLabel="Correction proposals" width={640} onClose={onClose}>
			<ModalHeader title="Proposed corrections" onClose={onClose} />
			<ModalBody>
				{error && (
					<p
						style={{
							margin: "0 0 12px",
							color: theme.colors.error ?? "#e5534b",
							fontSize: theme.fontSizes[0],
						}}
					>
						{error}
					</p>
				)}

				{notice && (
					<p
						role="status"
						style={{
							margin: "0 0 12px",
							padding: "8px 12px",
							borderRadius: 8,
							border: `1px solid ${
								notice.kind === "accepted"
									? (theme.colors.success ?? "#2da44e")
									: theme.colors.border
							}`,
							background:
								notice.kind === "accepted"
									? "rgba(45, 164, 78, 0.10)"
									: theme.colors.background,
							color:
								notice.kind === "accepted"
									? (theme.colors.success ?? "#2da44e")
									: muted,
							fontSize: theme.fontSizes[1],
							lineHeight: 1.5,
						}}
					>
						{notice.kind === "accepted"
							? `Accepted — applied ${notice.changeCount} change${notice.changeCount === 1 ? "" : "s"}. Closing…`
							: `Rejected — discarded ${notice.changeCount} change${notice.changeCount === 1 ? "" : "s"}. Closing…`}
					</p>
				)}

				{proposals === null && (
					<p style={{ color: muted, fontSize: theme.fontSizes[1] }}>
						Loading…
					</p>
				)}

				{proposals && shown.length === 0 && (
					<p style={{ color: muted, fontSize: theme.fontSizes[1] }}>
						{lane
							? "No pending proposals in this lane."
							: "No pending proposals."}
					</p>
				)}

				<div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
					{shown.map((p) => {
						const previewAlias = proposalComponentAlias(p);
						const previewComponent =
							componentsByAlias && previewAlias
								? (componentsByAlias.get(previewAlias) ?? null)
								: null;
						return (
							<ProposalCard
								key={p.id}
								proposal={p}
								previewComponent={previewComponent}
								action={busy[p.id]}
								copied={copiedId === p.id}
								onAccept={onAccept}
								onReject={onReject}
								onScore={onScore}
								onCopyForAgent={onCopyForAgent}
							/>
						);
					})}
				</div>
			</ModalBody>
		</Modal>
	);
}
