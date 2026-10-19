# @principal-ai/subsystems-react

React UI for **Subsystem Models**: component graphs, Pierre code views, graphify helpers, and session-event feeds used by Subsystems Studio.

## Install

```bash
npm install @principal-ai/subsystems-react
```

Peer dependency: `@principal-ai/subsystems-core` (>= 0.29.0), plus React 18/19.

## Main exports

- `SubsystemComponentGraph` — interactive subsystem model graph
- `SymbolFocusedView` — one graphify symbol and its radius-1 neighborhood on the same canvas
- Pierre wrappers — `PierreFileView`, `PierreSnippetView`, `PierreTrailCodeView`
- Graphify helpers — anchor/signature/kind utilities, plus `toSymbolFocusedView` for the symbol-focus projection
- `SessionEventFeed` / `SessionEventFeedGrouped` — agent session event feeds
- ELK layout helpers — `computeElkLayout`, `useElkLayout`
