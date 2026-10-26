/**
 * One C4 sketch in the Subsystems list.
 *
 * A sketch is a different artifact from a subsystem model: it has no files,
 * trails, audit, or gist. The row carries a distinct icon and badge so it
 * reads as a hypothesis rather than a model, and opens its own `c4-sketch`
 * tab.
 */

import { useState } from "react";
import { PencilRuler, Trash2 } from "lucide-react";
import { useTheme } from "@principal-ade/industry-theme";
import type { C4SketchSummary } from "../../shared/contract";

/** `pkg:github/CopilotKit/openbot` → `CopilotKit/openbot`. */
function repoLabel(repoKey: string): string {
  const withoutScheme = repoKey.replace(/^pkg:[^/]+\//, "");
  const parts = withoutScheme.split("/").filter(Boolean);
  return parts.slice(-2).join("/") || repoKey;
}

export function SubsystemSketchCard({
  sketch,
  onOpen,
  onDelete,
}: {
  sketch: C4SketchSummary;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const { theme } = useTheme();
  const muted = theme.colors.textMuted ?? theme.colors.textSecondary;
  const [hovered, setHovered] = useState(false);
  const [armed, setArmed] = useState(false);
  const counts = sketch.counts;
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        onOpen();
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => {
        setHovered(false);
        setArmed(false);
      }}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "10px 24px",
        cursor: "pointer",
        background: hovered
          ? (theme.colors.backgroundSecondary ?? theme.colors.background)
          : "transparent",
      }}
    >
      <PencilRuler
        size={14}
        style={{ color: "#e3b341", flexShrink: 0 }}
        aria-hidden="true"
      />
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span
            style={{
              fontWeight: 600,
              color: theme.colors.text,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {sketch.title}
          </span>
          <span
            style={{
              padding: "0 5px",
              borderRadius: 3,
              border: "1px solid #e3b341",
              color: "#e3b341",
              fontFamily: theme.fonts.monospace,
              fontSize: 9,
              letterSpacing: 0.3,
              flexShrink: 0,
            }}
          >
            C4 SKETCH
          </span>
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            flexWrap: "wrap",
            marginTop: 2,
            fontSize: theme.fontSizes[0],
            color: muted,
          }}
        >
          <span>
            {counts.containers} container{counts.containers === 1 ? "" : "s"} ·{" "}
            {counts.components} component{counts.components === 1 ? "" : "s"} ·{" "}
            {counts.edges} line{counts.edges === 1 ? "" : "s"}
          </span>
          {sketch.repoKeys.length > 0 && (
            <span style={{ display: "inline-flex", gap: 4, flexWrap: "wrap" }}>
              {sketch.repoKeys.slice(0, 2).map((repo) => (
                <code
                  key={repo}
                  style={{
                    fontFamily: theme.fonts.monospace,
                    fontSize: 10,
                    color: muted,
                    background: theme.colors.backgroundSecondary ?? "transparent",
                    padding: "0 4px",
                    borderRadius: 3,
                  }}
                >
                  {repoLabel(repo)}
                </code>
              ))}
              {sketch.repoKeys.length > 2 && (
                <span>+{sketch.repoKeys.length - 2}</span>
              )}
            </span>
          )}
          {sketch.author && <span>by {sketch.author}</span>}
        </div>
      </div>
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          if (armed) onDelete();
          else setArmed(true);
        }}
        onKeyDown={(event) => event.stopPropagation()}
        title={armed ? "Confirm delete" : "Delete sketch"}
        aria-label={`Delete sketch ${sketch.title}`}
        style={{
          flexShrink: 0,
          border: "none",
          background: "transparent",
          color: armed ? (theme.colors.error ?? "#e5534b") : muted,
          cursor: "pointer",
          fontFamily: theme.fonts.monospace,
          fontSize: theme.fontSizes[0],
          padding: "2px 6px",
          borderRadius: 4,
        }}
      >
        {armed ? "Delete?" : <Trash2 size={12} />}
      </button>
    </div>
  );
}
