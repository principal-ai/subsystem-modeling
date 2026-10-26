/**
 * C4SketchView — loads one authored C4 sketch and renders it standalone.
 *
 * The React `C4SketchView` owns the header, the notes sidebar, the canvas, and
 * open-container state. This view only fetches the sketch and handles the tab's
 * loading/error states.
 */

import { useCallback, useEffect, useState } from "react";
import { C4SketchView as SketchView } from "@principal-ai/subsystems-react";
import { electrobun } from "../rpc";
import { CenteredMessage } from "../ui";
import type { C4Sketch } from "../../shared/contract";

export function C4SketchView({
	tabId,
	sketchId,
}: {
	tabId: string;
	sketchId: string;
}) {
	const [sketch, setSketch] = useState<C4Sketch | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	const load = useCallback(async () => {
		setLoading(true);
		setError(null);
		try {
			const res = await electrobun.rpc!.request.getC4Sketch({ sketchId });
			if (!res.ok || !res.sketch) {
				setSketch(null);
				setError(res.error ?? `Sketch not found: ${sketchId}`);
				return;
			}
			setSketch(res.sketch);
		} catch (err) {
			setSketch(null);
			setError(err instanceof Error ? err.message : String(err));
		} finally {
			setLoading(false);
		}
	}, [sketchId]);

	useEffect(() => {
		void load();
	}, [load]);

	if (loading && !sketch) {
		return <CenteredMessage title="Loading C4 sketch…" />;
	}
	if (error) {
		return <CenteredMessage title="Could not open C4 sketch" detail={error} />;
	}
	if (!sketch) return null;

	return (
		<div
			data-tab-id={tabId}
			style={{ width: "100%", height: "100%", display: "flex" }}
		>
			<SketchView
				sketch={sketch}
				persistKey={`c4-sketch-notes-${sketch.id}`}
			/>
		</div>
	);
}
