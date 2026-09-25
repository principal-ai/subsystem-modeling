/**
 * RunMaintenanceConfirm — the "Run maintenance?" dialog shown when a run would
 * replace existing proposals. Presentational only; the caller owns the portal,
 * the delete-then-run behavior, and the View proposals navigation.
 */

import { ListChecks, Wrench } from "lucide-react";
import { useTheme } from "@principal-ade/industry-theme";
import {
	Modal,
	ModalBody,
	ModalButton,
	ModalFooter,
	ModalHeader,
} from "./Modal";

export function RunMaintenanceConfirm({
	kind,
	count,
	busy,
	onCancel,
	onConfirm,
	onViewProposals,
}: {
	kind: "single" | "batch";
	count: number;
	busy: boolean;
	onCancel: () => void;
	onConfirm: () => void;
	/** Single-model proposals only — opens the review modal. */
	onViewProposals?: () => void;
}) {
	const { theme } = useTheme();
	const message =
		kind === "single"
			? `This deletes ${count} existing proposal${
					count === 1 ? "" : "s"
				}, then runs a fresh maintenance pass.`
			: `This deletes ${count} existing proposal${
					count === 1 ? "" : "s"
				} across the models in this repo, then runs maintenance on each.`;
	return (
		<Modal
			ariaLabel="Run maintenance"
			width={480}
			onClose={busy ? undefined : onCancel}
		>
			<ModalHeader icon={Wrench} title="Run maintenance?" />
			<ModalBody>{message}</ModalBody>
			<ModalFooter>
				{onViewProposals && (
					<ModalButton
						icon={ListChecks}
						disabled={busy}
						onClick={onViewProposals}
						style={{
							marginRight: "auto",
							color: theme.colors.primary,
							border: `1px solid ${theme.colors.primary}`,
						}}
					>
						View proposals
					</ModalButton>
				)}
				<ModalButton disabled={busy} onClick={onCancel}>
					Cancel
				</ModalButton>
				<ModalButton
					variant="primary"
					icon={Wrench}
					busy={busy}
					onClick={onConfirm}
				>
					{busy ? "Deleting…" : "Delete & run"}
				</ModalButton>
			</ModalFooter>
		</Modal>
	);
}
