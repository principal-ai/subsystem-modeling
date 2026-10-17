/**
 * useEscapeToClose — dismiss a dialog with the Escape key.
 *
 * One behavior, shared by every dialog surface: the `Modal` shell uses it
 * directly, and the hand-rolled overlays (settings, identity, integration,
 * graphify) use it so Escape matches their backdrop click. Pass `undefined`
 * (or `enabled: false`) when the dialog isn't dismissable right now.
 */

import { useEffect } from "react";

export function useEscapeToClose(
	onClose: (() => void) | undefined,
	enabled = true,
): void {
	useEffect(() => {
		if (!onClose || !enabled) return;
		const onKeyDown = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				e.preventDefault();
				onClose();
			}
		};
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [onClose, enabled]);
}
