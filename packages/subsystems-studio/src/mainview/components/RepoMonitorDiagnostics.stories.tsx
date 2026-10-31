import type { Meta, StoryObj } from "@storybook/react";
import {
	RepoMonitorChecking,
	RepoMonitorDiagnostics,
	type RepoMonitorRepoDiagnostics,
} from "./RepoMonitorDiagnostics";

/** Fixed clock so relative labels ("3m ago") render the same every time. */
const NOW = Date.UTC(2026, 9, 30, 14, 0, 0);
const min = (n: number) => NOW - n * 60_000;

const SOCKET = "/Users/griever/.principal/repo-monitor.sock";

const repos: RepoMonitorRepoDiagnostics[] = [
	{
		path: "/Users/griever/Developer/principal-ai/subsystem-modeling",
		isWatching: true,
		watchingMode: "minimal",
		watchReferenceCount: 2,
		fsMonitorEnabled: true,
		slices: {
			fileTree: { updatedAt: min(0.05), sha: "d1c016f86cbf", count: 1842 },
			packages: { updatedAt: min(3), count: 5 },
			gitStatus: { updatedAt: min(0.05), sha: "d1c016f86cbf" },
			gitRemote: { updatedAt: min(140) },
		},
	},
	{
		path: "/Users/griever/Developer/principal-ai/repository-monitoring-server",
		isWatching: true,
		watchingMode: "fallback",
		watchReferenceCount: 1,
		fsMonitorEnabled: false,
		slices: {
			fileTree: { building: true, updatedAt: min(12), sha: "9c43b2fdc392", count: 96 },
			packages: { updatedAt: min(12), count: 1 },
			gitStatus: { updatedAt: min(1) },
			gitRemote: { updatedAt: min(140) },
		},
	},
	{
		path: "/Users/griever/Developer/principal-ai/alexandria",
		isWatching: false,
		watchingMode: "none",
		watchReferenceCount: 0,
		fsMonitorEnabled: false,
		slices: {
			fileTree: { updatedAt: min(95), sha: "41ab09e2f00c", count: 4120 },
			gitRemote: { updatedAt: min(95) },
		},
	},
	{
		path: "/Users/griever/Developer/oss/next.js",
		isWatching: false,
		watchingMode: "none",
		watchReferenceCount: 0,
		fsMonitorEnabled: false,
		slices: {
			fileTree: { error: "EACCES: permission denied, scandir 'packages/next/.turbo'" },
		},
	},
];

const meta = {
	title: "Settings/RepoMonitorDiagnostics",
	component: RepoMonitorDiagnostics,
	parameters: { layout: "fullscreen" },
	args: {
		now: NOW,
		onRefresh: () => {},
		onStart: () => {},
		onRestart: () => {},
		onRebuild: () => {},
		diagnostics: {
			state: "running",
			socketPath: SOCKET,
			pid: 48213,
			version: "2.3.0",
			protocolVersion: 1,
			startedAt: min(6 * 60 + 14),
			owner: "studio",
			clients: 2,
			watcherImpl: "parcel",
			watcherFallbackReason: null,
			memoryBytes: 184 * 1024 * 1024,
			cpuMs: 42_300,
			repos,
		},
	},
} satisfies Meta<typeof RepoMonitorDiagnostics>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Healthy daemon spawned by this Studio, four repos in mixed states. */
export const Running: Story = {};

/** Daemon already running, started by the desktop app; Studio is just a client. */
export const OwnedByDesktopApp: Story = {
	args: {
		diagnostics: {
			...meta.args.diagnostics,
			owner: "desktop",
			clients: 3,
			startedAt: min(3 * 24 * 60),
			memoryBytes: 412 * 1024 * 1024,
			cpuMs: 1_830_000,
		},
	},
};

/** Parcel failed to load, so every watcher runs through Chokidar. */
export const ChokidarFallback: Story = {
	args: {
		diagnostics: {
			...meta.args.diagnostics,
			watcherImpl: "chokidar",
			watcherFallbackReason:
				"@parcel/watcher native binding not found for darwin-arm64 (Error: Cannot find module '@parcel/watcher-darwin-arm64')",
			repos: repos.map((r) => ({
				...r,
				watchingMode: r.isWatching ? "fallback" : "none",
				fsMonitorEnabled: false,
			})),
		},
	},
};

/** Daemon up with nothing registered yet. */
export const NoRepos: Story = {
	args: {
		diagnostics: { ...meta.args.diagnostics, repos: [], clients: 1 },
	},
};

/** Studio just spawned the daemon and is waiting for the ready handshake. */
export const Starting: Story = {
	args: {
		diagnostics: { state: "starting", socketPath: SOCKET, pid: 48213 },
	},
};

/** Nothing answers the socket; file trees cannot load until it starts. */
export const Unreachable: Story = {
	args: {
		diagnostics: {
			state: "unreachable",
			socketPath: SOCKET,
			error: "connect ECONNREFUSED /Users/griever/.principal/repo-monitor.sock",
			lastSeenAt: min(47),
		},
	},
};

/** Never seen a daemon on this machine — no error, no last-seen. */
export const NeverStarted: Story = {
	args: {
		diagnostics: { state: "unreachable", socketPath: SOCKET },
	},
};

/** Refresh in flight — the button spins and disables. */
export const Refreshing: Story = {
	args: { refreshing: true },
};

/** Before the first status reply arrives from the host. */
export const Checking: Story = {
	render: () => <RepoMonitorChecking />,
};
