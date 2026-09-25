/**
 * LaneHelpDialog — "what does this lane verify" help popover, opened from the
 * panel header's lane legend. Presentational; the caller owns the portal.
 */

import { useTheme } from "@principal-ade/industry-theme";
import type { LucideIcon } from "lucide-react";
import {
	Modal,
	ModalBody,
	ModalButton,
	ModalFooter,
	ModalHeader,
} from "./Modal";

export interface LaneStatusLegendEntry {
	status: string;
	label: string;
	desc: string;
	/** Resolved colour for the status label. */
	color: string;
}

export function LaneHelpDialog({
	Icon,
	name,
	blurb,
	legend,
	onClose,
}: {
	Icon: LucideIcon;
	name: string;
	blurb: string;
	legend: LaneStatusLegendEntry[];
	onClose: () => void;
}) {
	const { theme } = useTheme();
	const muted = theme.colors.textSecondary;
	return (
		<Modal
			ariaLabel={`${name} — what this lane verifies`}
			width={440}
			onClose={onClose}
		>
			<ModalHeader icon={Icon} title={name} />
			<ModalBody scroll={false}>
				<p
					style={{
						margin: "0 0 14px",
						fontSize: theme.fontSizes[1],
						lineHeight: 1.55,
						color: muted,
					}}
				>
					{blurb}
				</p>
				<div
					style={{
						fontSize: theme.fontSizes[1],
						textTransform: "uppercase",
						letterSpacing: 0.3,
						color: muted,
						marginBottom: 6,
					}}
				>
					Status colours
				</div>
				<div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
					{legend.map(({ status, label, desc, color }) => (
						<div
							key={status}
							style={{
								display: "flex",
								alignItems: "baseline",
								gap: 8,
								fontSize: theme.fontSizes[1],
							}}
						>
							<span
								style={{
									width: 64,
									flexShrink: 0,
									fontWeight: 600,
									color,
								}}
							>
								{label}
							</span>
							<span style={{ color: muted }}>{desc}</span>
						</div>
					))}
				</div>
			</ModalBody>
			<ModalFooter>
				<ModalButton variant="primary" onClick={onClose}>
					Done
				</ModalButton>
			</ModalFooter>
		</Modal>
	);
}
