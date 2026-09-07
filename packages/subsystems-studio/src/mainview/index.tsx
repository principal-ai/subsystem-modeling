/**
 * Trail viewer mainview — bootstrap entry. The App shell (tab dispatch, error
 * boundary, view wiring) lives in `App.tsx`; this file only injects the
 * stylesheets that electrobun's views:// scheme drops and mounts the root.
 */

// electrobun's views:// scheme serves .css with a non-text/css MIME, so neither
// the <link> in index.html nor a bundled CSS-import sibling .css ever loads —
// both paths are silently dropped by WebKit. A plain `import "...style.css"`
// would just emit one of those dead siblings. So we import both stylesheets as
// *text* (the `{ type: "text" }` loader inlines the CSS into this JS bundle as a
// string) and inject them imperatively in `injectStyles()` below, which is the
// only mechanism that reliably lands. Without this the UA `body { margin: 8px }`
// leaks back in (16px overflow + top/left gap) and React Flow — which the
// FileCityTrailExplorerPanel's sequence view renders — ships completely
// unstyled.
import xyflowStyles from "@xyflow/react/dist/style.css" with { type: "text" };
import excalidrawStyles from "@excalidraw/excalidraw/index.css" with { type: "text" };
import resetStyles from "./index.css" with { type: "text" };

import mermaid from "mermaid";
import { createRoot } from "react-dom/client";
import {
	ThemeProvider,
	slateNeonTheme,
} from "@principal-ade/industry-theme";
import { App, ErrorBoundary } from "./App";

// Themed-markdown's IndustryMermaidDiagram renders through `window.mermaid` —
// the host app is expected to register the singleton. Without this, mermaid
// diagrams never render (they sit at "Optimizing view…" forever). Mirrors the
// registration themed-markdown's own Storybook preview does.
if (typeof window !== "undefined") {
	(window as Window & { mermaid?: typeof mermaid }).mermaid = mermaid;
}

// electrobun drops bundled/linked .css (wrong MIME on the views:// scheme), so
// neither our reset (index.css) nor React Flow / Excalidraw stylesheets reach
// WebKit through the normal paths. They are imported above as text (inlined
// into this bundle); inject them with <style> tags here — a JS-built <style>
// always applies. The reset goes in first so React Flow / Excalidraw win any
// overlap. Without index.css the UA `body { margin: 8px }` survives and the
// 100vh app overflows by 16px; without the React Flow CSS the sequence-view
// panes render unstyled; without Excalidraw CSS the drawing overlay is blank.
function injectStyles(): void {
	for (const [marker, css] of [
		["data-principal-studio-reset", resetStyles],
		["data-xyflow-react", xyflowStyles],
		["data-excalidraw", excalidrawStyles],
	] as const) {
		const style = document.createElement("style");
		style.setAttribute(marker, "");
		style.textContent = css;
		document.head.appendChild(style);
	}
}
injectStyles();

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("Missing #root");
createRoot(rootEl).render(
	<ThemeProvider theme={slateNeonTheme}>
		<ErrorBoundary>
			<App />
		</ErrorBoundary>
	</ThemeProvider>,
);
