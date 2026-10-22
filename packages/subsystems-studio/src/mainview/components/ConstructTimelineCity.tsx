import { useEffect, useMemo, useRef, useState } from "react";
import { useTheme } from "@principal-ade/industry-theme";
import { FileCity3D } from "@principal-ai/file-city-react";
import type { ConstructTimelineFileSnapshot } from "../../shared/construct-timeline";
import { timelineChangeLayers, timelineFileLayers } from "./timelineFileCity";
import { allowTimelineScroll, buildTimelineCity, timelineCityTransition, TIMELINE_CAMERA_CONTROLS } from "./timelineCityTransition";

export default function ConstructTimelineCity({ snapshot, selectedPath, onSelect, showChanges = false }: {
	snapshot: ConstructTimelineFileSnapshot;
	selectedPath: string | null;
	onSelect: (path: string) => void;
	showChanges?: boolean;
}) {
	const { theme } = useTheme();
	const [grown, setGrown] = useState(false);
	// Equivalent RPC refreshes must not rebuild the layout or restart animation.
	const signature = useMemo(() => JSON.stringify(snapshot.files), [snapshot.files]);
	const target = useMemo(() => buildTimelineCity(snapshot), [signature]);
	const [city, setCity] = useState(target);
	const displayed = useRef(target);
	useEffect(() => {
		const publish = (value: typeof target) => { displayed.current = value; setCity(value); };
		const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
		if (displayed.current === target || motion.matches) { publish(target); return; }
		const interpolate = timelineCityTransition(displayed.current, target);
		let frame = 0;
		const start = performance.now();
		const tick = (now: number) => {
			const progress = Math.min(1, (now - start) / 1200);
			publish(interpolate(progress));
			if (progress < 1) frame = requestAnimationFrame(tick);
		};
		const finish = () => {
			if (motion.matches) { cancelAnimationFrame(frame); publish(target); }
		};
		frame = requestAnimationFrame(tick);
		motion.addEventListener("change", finish);
		return () => { cancelAnimationFrame(frame); motion.removeEventListener("change", finish); };
	}, [target]);
	const layers = useMemo(() => showChanges ? timelineChangeLayers(snapshot) : timelineFileLayers(snapshot), [snapshot, showChanges]);
	return (
		<div onWheelCapture={allowTimelineScroll} style={{ position: "relative", height: 460, minWidth: 0 }}>
			<FileCity3D cityData={city} highlightLayers={layers} isolationMode="none"
				cameraControls={TIMELINE_CAMERA_CONTROLS}
				defaultBuildingColor="#64748b" isGrown={grown} selectedPath={selectedPath}
				onBuildingClick={(building) => onSelect(building.path)} showInfoPanel={false}
				backgroundColor={theme.colors.background} width="100%" height="100%" />
			<button type="button" onClick={() => setGrown(!grown)} aria-pressed={grown}
				style={{ position: "absolute", top: 10, right: 10, padding: "6px 10px", cursor: "pointer",
					background: theme.colors.background, color: theme.colors.text, border: `1px solid ${theme.colors.border}`, borderRadius: 4 }}>
				{grown ? "2D file map" : "3D city"}
			</button>
		</div>
	);
}
