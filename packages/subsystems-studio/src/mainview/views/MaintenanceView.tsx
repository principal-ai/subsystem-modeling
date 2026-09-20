/**
 * MaintenanceView — the Maintenance permanent tab. Renders the same
 * MaintenancePanel the AppHeader chip used to show as a modal, full-bleed with
 * its repo filter. The panel subscribes to host broadcasts for live updates, so
 * mounting is enough — there's no extra `active` gating needed.
 */

import { useTheme } from "@principal-ade/industry-theme";
import { MaintenancePanel } from "../components/MaintenanceAgentModal";

export function MaintenanceView() {
	const { theme } = useTheme();
	return (
		<div
			style={{
				flex: 1,
				minHeight: 0,
				display: "flex",
				flexDirection: "column",
				background: theme.colors.background,
				color: theme.colors.text,
				fontFamily: theme.fonts.body,
			}}
		>
			<MaintenancePanel overlay={false} />
		</div>
	);
}