/**
 * DeleteAllProposalsDialog — confirm deleting every pending proposal across all
 * models. Presentational only; the caller owns the portal and the delete call.
 */

import { Trash2 } from "lucide-react";
import { useTheme } from "@principal-ade/industry-theme";
import {
	Modal,
	ModalBody,
	ModalButton,
	ModalFooter,
	ModalHeader,
} from "./Modal";

export function DeleteAllProposalsDialog({
	count,
	running,
	error,
	onCancel,
	onConfirm,
}: {
	count: number;
	running: boolean;
	error?: string | null;
	onCancel: () => void;
	onConfirm: () => void;
}) {
	const { theme } = useTheme();
	return (
		<Modal
			ariaLabel="Delete all proposals"
			width={480}
			onClose={running ? undefined : onCancel}
		>
			<ModalHeader
				icon={Trash2}
				tone="danger"
				title={`Delete all ${count} proposal${count === 1 ? "" : "s"}`}
			/>
			<ModalBody>
				{running
					? "Deleting…"
					: "Deletes every pending proposal across all models. Accepted/rejected history is kept and model files are not changed."}
				{error && (
					<div
						style={{
							marginTop: 10,
							color: theme.colors.error ?? "#e5534b",
						}}
					>
						{error}
					</div>
				)}
			</ModalBody>
			<ModalFooter>
				<ModalButton disabled={running} onClick={onCancel}>
					{running ? "Cancel" : "Keep them"}
				</ModalButton>
				<ModalButton
					variant="danger"
					icon={Trash2}
					busy={running}
					onClick={onConfirm}
				>
					{running ? "Deleting…" : "Delete all"}
				</ModalButton>
			</ModalFooter>
		</Modal>
	);
}
