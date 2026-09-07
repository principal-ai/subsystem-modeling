import type { ElectrobunConfig } from "electrobun";

export default {
	app: {
		// Human display name — Electrobun bakes this into CFBundleName of the
		// *inner* self-extracted .app (what macOS shows in the menu bar). The
		// outer wrapper name is rewritten separately in scripts/stage-bundle.ts.
		name: "Subsystems Studio",
		identifier: "ai.principal.subsystems-studio",
		version: "0.1.0",
	},
	build: {
		bun: {
			entrypoint: "src/bun/index.ts",
		},
		views: {
			mainview: {
				entrypoint: "src/mainview/index.tsx",
			},
		},
		copy: {
			"src/mainview/index.html": "views/mainview/index.html",
			"src/mainview/index.css": "views/mainview/index.css",
			"src/mainview/agent-logos": "views/mainview/agent-logos",
		},
		mac: {
			bundleCEF: false,
			icons: "icon.iconset",
		},
		linux: {
			bundleCEF: false,
		},
		win: {
			bundleCEF: false,
		},
	},
} satisfies ElectrobunConfig;
