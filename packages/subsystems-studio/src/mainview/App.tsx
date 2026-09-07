/**
 * App — top-level shell for the principal-studio mainview. Owns the tab list +
 * active tab, the ErrorBoundary that wraps the tree, and ActiveTab (the
 * loading/error/ready dispatch that renders the current tab's view).
 */

import {
	Component,
	useCallback,
	useEffect,
	useLayoutEffect,
	useReducer,
	useRef,
	useState,
} from "react";
import type { ErrorInfo, ReactNode } from "react";
import { useTheme } from "@principal-ade/industry-theme";
import { GitFileTreeBuilder } from "@principal-ai/repository-abstraction";
import type { IntroductionTour } from "@principal-ai/file-city-builder";
import type { TrailPayload } from "@industry-theme/file-city-panel";
import type { TabSummary } from "../shared/contract";
import { electrobun, reloadSubscribers } from "./rpc";
import type { TabState } from "./types";
import { CenteredMessage } from "./ui";
import { AppHeader } from "./components/AppHeader";
import { TabStrip } from "./components/TabStrip";
import { AgentSessionsOverviewView } from "./views/AgentSessions";
import { LibraryView } from "./views/LibraryView";
import { SubsystemModelsView } from "./views/SubsystemModelsView";
import { GraphifyReposView } from "./views/GraphifyReposView";
import { AnalysisView } from "./views/AnalysisView";
import { SessionEventsView } from "./views/SessionEventsView";
import { PromptView } from "./views/PromptView";
import { SubsystemModelView } from "./views/SubsystemModelView";
import { TrailViewer } from "./views/TrailViewer";
import { TourViewer } from "./views/TourViewer";

interface BoundaryState {
	error: Error | null;
	info: string;
}

class ErrorBoundary extends Component<
	{ children: ReactNode },
	BoundaryState
> {
	state: BoundaryState = { error: null, info: "" };
	static getDerivedStateFromError(error: Error): BoundaryState {
		return { error, info: "" };
	}
	componentDidCatch(error: Error, info: ErrorInfo): void {
		this.setState({ error, info: info.componentStack ?? "" });
		console.error("[principal-studio] render error:", error, info);
	}
	render(): ReactNode {
		if (this.state.error) {
			return (
				<pre
					style={{
						width: "100vw",
						height: "100vh",
						background: "#1a0e0e",
						color: "#ffaaaa",
						padding: 24,
						margin: 0,
						overflow: "auto",
						fontSize: 12,
						fontFamily: "ui-monospace, monospace",
						whiteSpace: "pre-wrap",
					}}
				>
					{`Render error:\n\n${this.state.error.name}: ${this.state.error.message}\n\nStack:\n${this.state.error.stack ?? "(none)"}\n\nComponent stack:\n${this.state.info}`}
				</pre>
			);
		}
		return this.props.children;
	}
}

// Permanent, non-trail tab ids. These views stay mounted once visited (hidden
// while inactive), so heavy views like the library don't reload every time you
// switch back to them. Trail tabs are excluded — each one mounts a full 3D
// city, so only the active trail is mounted at a time.
const STATIC_TAB_IDS = new Set(["library", "agent-sessions", "subsystems", "graphify"]);

// Permanent tabs carry no host payload — their resolved state is known from the
// tab id alone, so they mount without a getTab round-trip. The static views
// fetch their own data; gating their mount on the host left a blank pane for as
// long as getTab sat behind a busy host.
function staticTabState(tabId: string): TabState | null {
	if (tabId === "library") return { kind: "library" };
	if (tabId === "agent-sessions") return { kind: "agent-sessions" };
	if (tabId === "subsystems") return { kind: "subsystems" };
	if (tabId === "graphify") return { kind: "graphify" };
	return null;
}

// Rendered view for a resolved static tab, or null for transient states. The
// returned node is registered with App's keep-mounted stack on first resolve.
function renderStaticView(state: TabState): ReactNode | null {
	if (state.kind === "library") return <LibraryView />;
	if (state.kind === "agent-sessions") return <AgentSessionsOverviewView />;
	if (state.kind === "subsystems") return <SubsystemModelsView />;
	if (state.kind === "graphify") return <GraphifyReposView />;
	return null;
}

function ActiveTab({
	tabId,
	isStaticMounted,
	onRegister,
}: {
	tabId: string;
	isStaticMounted: boolean;
	onRegister: (id: string, node: ReactNode) => void;
}) {
	const [state, setState] = useState<TabState>(
		() => staticTabState(tabId) ?? { kind: "loading" },
	);

	useEffect(() => {
		// View already keep-mounted — it's live in the stack; nothing to load.
		if (isStaticMounted) return;
		// Static tabs are already resolved (state seeded above) — no getTab.
		if (staticTabState(tabId)) return;
		let cancelled = false;
		setState({ kind: "loading" });
		(async () => {
			try {
				const tab = await electrobun.rpc!.request.getTab({ id: tabId });
				if (cancelled) return;
				if (tab.kind === "analysis") {
					setState({
						kind: "analysis",
						id: tab.id,
						analysisId: tab.analysisId ?? "",
					});
					return;
				}
				if (tab.kind === "session-events") {
					setState({
						kind: "session-events",
						id: tab.id,
						sessionId: tab.sessionId ?? "",
					});
					return;
				}
				if (tab.kind === "prompt") {
					setState({ kind: "prompt", id: tab.id });
					return;
				}
				if (tab.kind === "subsystem-model") {
					setState({
						kind: "subsystem-model",
						id: tab.id,
						graphId: tab.graphId ?? "",
					});
					return;
				}
				if (!tab.ok || !tab.payload) {
					setState({
						kind: "error",
						message: tab.error ?? "Could not load tab",
					});
					return;
				}
				const tree = await electrobun.rpc!.request.getFileTree({ tabId });
				if (cancelled) return;
				const fileTree = new GitFileTreeBuilder().build({
					files: tree.files,
					rootPath: "/local",
					commitSha: "local",
					branch: "local",
				});
				if (tab.payloadKind === "tour") {
					setState({
						kind: "ready-tour",
						id: tab.id,
						tour: tab.payload as IntroductionTour,
						fileTree,
						repoRoot: tab.repoRoot ?? "",
						owner: tab.owner,
						repo: tab.repo,
					});
					return;
				}
				setState({
					kind: "ready",
					id: tab.id,
					payload: tab.payload as TrailPayload,
					fileTree,
					repoRoot: tab.repoRoot ?? "",
					owner: tab.owner,
					repo: tab.repo,
				});
			} catch (err) {
				if (cancelled) return;
				setState({
					kind: "error",
					message: err instanceof Error ? err.message : String(err),
				});
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [tabId, isStaticMounted]);

	// Once a static tab resolves, hand the view up to App so it stays mounted
	// in the keep-mounted stack. Layout effect so the view registers before
	// paint — no empty flash between resolve and show.
	useLayoutEffect(() => {
		if (isStaticMounted) return;
		if (!STATIC_TAB_IDS.has(tabId)) return;
		const node = renderStaticView(state);
		if (node) onRegister(tabId, node);
	}, [state, tabId, isStaticMounted, onRegister]);

	if (isStaticMounted) return null;
	if (state.kind === "loading") {
		// The agent-sessions tab mounts its own "Pulling Agent Sessions" loader,
		// so a "Loading trail…" flash here would double up and read wrong.
		if (tabId === "agent-sessions") return null;
		return <CenteredMessage title="Loading trail…" />;
	}
	if (state.kind === "error")
		return <CenteredMessage title="Could not load trail" detail={state.message} />;
	if (state.kind === "ready-tour") {
		return (
			<TourViewer
				tabId={state.id}
				tour={state.tour}
				fileTree={state.fileTree}
				repoRoot={state.repoRoot}
				hostOwner={state.owner}
				hostRepo={state.repo}
			/>
		);
	}
	if (state.kind === "ready") {
		return (
			<TrailViewer
				tabId={state.id}
				payload={state.payload}
				fileTree={state.fileTree}
				repoRoot={state.repoRoot}
				hostOwner={state.owner}
				hostRepo={state.repo}
			/>
		);
	}
	if (state.kind === "analysis") {
		return <AnalysisView tabId={state.id} analysisId={state.analysisId} />;
	}
	if (state.kind === "session-events") {
		return <SessionEventsView sessionId={state.sessionId} />;
	}
	if (state.kind === "prompt") {
		return <PromptView tabId={state.id} />;
	}
	if (state.kind === "subsystem-model") {
		return <SubsystemModelView tabId={state.id} graphId={state.graphId} />;
	}
	// Static tab resolved — the rendered view is registered with App's
	// keep-mounted stack and rendered there, not here.
	return null;
}

export function App() {
	const { theme } = useTheme();
	const [tabs, setTabs] = useState<TabSummary[]>([]);
	// The renderer owns the on-screen tab: clicks apply locally and instantly.
	// The host only ever *suggests* a tab (boot/resume via listTabs, or a
	// focusTabId on tabsChanged when it opens a tab / is externally activated).
	const [activeTabId, setActiveTabId] = useState<string>("subsystems");
	// Read the current active tab without re-registering the refresh callback.
	const activeTabIdRef = useRef(activeTabId);
	activeTabIdRef.current = activeTabId;
	// Once the user clicks a tab, the host's boot/resume suggestion must not
	// override their own selection on a later listTabs.
	const userChoseRef = useRef(false);

	// Keep-mounted views for permanent tabs (library, agent sessions,
	// subsystems). Each view registers once on first visit and stays in the
	// stack hidden via display:none while inactive, so switching back doesn't
	// remount (and reload) it.
	const mountedViews = useRef<Map<string, ReactNode>>(new Map());
	const [, bump] = useReducer((n: number) => n + 1, 0);

	const registerView = useCallback((id: string, node: ReactNode) => {
		if (mountedViews.current.has(id)) return;
		mountedViews.current.set(id, node);
		bump();
	}, []);

	useEffect(() => {
		const refresh = async (focusTabId?: string) => {
			try {
				const result = await electrobun.rpc!.request.listTabs({});
				setTabs(result.tabs);
				const current = activeTabIdRef.current;
				const focusValid =
					focusTabId !== undefined &&
					result.tabs.some((t) => t.id === focusTabId);
				const currentValid = result.tabs.some((t) => t.id === current);
				const suggestionValid =
					!userChoseRef.current &&
					result.tabs.some((t) => t.id === result.suggestedActiveTabId);
				let next: string;
				if (focusValid) next = focusTabId!;
				else if (currentValid) next = current;
				else if (suggestionValid) next = result.suggestedActiveTabId;
				else next = result.tabs[result.tabs.length - 1]?.id ?? "library";
				if (next !== current) {
					setActiveTabId(next);
					// Fire-and-forget: the renderer already switched; this just
					// keeps the host's resume suggestion in sync.
					void electrobun.rpc!.request.setActiveTab({ id: next });
				}
			} catch (err) {
				console.error("[principal-studio] listTabs failed:", err);
			}
		};
		void refresh();
		reloadSubscribers.add(refresh);
		return () => {
			reloadSubscribers.delete(refresh);
		};
	}, []);

	const onSelect = useCallback((id: string) => {
		userChoseRef.current = true;
		// Switch immediately — the renderer owns the on-screen tab and never
		// waits on the host. The RPC just records the switch for resume.
		setActiveTabId(id);
		void electrobun.rpc!.request.setActiveTab({ id });
	}, []);

	const onClose = useCallback((id: string) => {
		void electrobun.rpc!.request.closeTab({ id });
	}, []);

	// Cmd+1..9 switches to the Nth tab in strip order.
	useEffect(() => {
		const onKeyDown = (e: KeyboardEvent) => {
			if (!e.metaKey || e.altKey || e.shiftKey || e.ctrlKey) return;
			if (!/^[1-9]$/.test(e.key)) return;
			const tab = tabs[Number(e.key) - 1];
			if (!tab) return;
			e.preventDefault();
			onSelect(tab.id);
		};
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [tabs, onSelect]);

	const libraryActive =
		tabs.find((t) => t.id === activeTabId)?.kind === "library" ||
		(tabs.length === 0 && activeTabId === "library");

	return (
		<div
			style={{
				width: "100%",
				height: "100vh",
				background: theme.colors.background,
				color: theme.colors.text,
				display: "flex",
				flexDirection: "column",
				overflow: "hidden",
			}}
		>
			<AppHeader libraryActive={libraryActive} />
			<TabStrip
				tabs={tabs}
				activeTabId={activeTabId}
				onSelect={onSelect}
				onClose={onClose}
			/>
			<div
				style={{
					position: "relative",
					flex: 1,
					minHeight: 0,
					width: "100%",
					display: "flex",
					flexDirection: "column",
				}}
			>
				{Array.from(mountedViews.current.entries()).map(([id, node]) => (
					<div
						key={id}
						style={{
							position: "absolute",
							inset: 0,
							display: id === activeTabId ? "flex" : "none",
							flexDirection: "column",
							overflow: "hidden",
						}}
					>
						{node}
					</div>
				))}
				<ActiveTab
					key={activeTabId}
					tabId={activeTabId}
					isStaticMounted={mountedViews.current.has(activeTabId)}
					onRegister={registerView}
				/>
			</div>
		</div>
	);
}

export { ErrorBoundary };
