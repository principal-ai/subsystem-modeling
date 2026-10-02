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
		// Electrobun 1.x always runs the main process on Bun (no Cottontail /
		// Hutch build-time runtime), so there is no `mainProcess` field.
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
			// esbuild-vendored Prettier, loaded as a plain script (see
			// scripts/build-prettier-vendor.ts).
			"src/mainview/vendor/prettier.js": "views/mainview/vendor/prettier.js",
			// Maintain agent prompts the host installs into ~/.config/opencode/agents/.
			// Without these they resolve to a placeholder in the packaged app
			// (see agentPackageCandidates in bun/maintain-model.ts). Listed by
			// file like the entries above — a bare directory key is not staged.
			"agents/construct-fixer.md": "agents/construct-fixer.md",
			"agents/construct-verifier.md": "agents/construct-verifier.md",
			"agents/package-module-fixer.md": "agents/package-module-fixer.md",
			"agents/package-module-verifier.md": "agents/package-module-verifier.md",
			"agents/runtime-topology-verifier.md":
				"agents/runtime-topology-verifier.md",
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
