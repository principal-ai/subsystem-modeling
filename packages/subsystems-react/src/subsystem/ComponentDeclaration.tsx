/**
 * ComponentDeclaration — the selected subsystem component rendered as it would
 * appear in code: a file-path comment + doc comment, then the construct's
 * declaration (`class X extends Y { ... }`, `function f(): T`, ...) with its
 * members as signatures. Graphify relationship drill-downs appear as trailing
 * comments. File content lives in the bottom FileDrawer, not here.
 */

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AlignLeft, FileText } from 'lucide-react';
import { useTheme } from '@principal-ade/industry-theme';
import { resolvePierreSyntaxThemeName } from '../pierre/pierreSyntaxTheme';
import {
  formatPurl,
  type SubsystemComponent,
  type SubsystemDeclTokenKind,
} from './model';
import type { SubsystemOpenFileOptions } from './declarationRef';
import { parseSourceLocation } from './declarationRef';
import { tokenizeComponent } from './tokenizeComponent';
import { componentColor } from '../pierre/constructColors';

/** Live / result state for the declaration-panel Verify control. */
export type ComponentVerificationPhase =
  | 'idle'
  | 'checking'
  | 'done'
  | 'error';

export interface ComponentVerificationState {
  phase: ComponentVerificationPhase;
  message?: string;
  /** Mirrors host `ok` when a structured verify result is available. */
  ok?: boolean;
  code?: string;
  file?: {
    exists: boolean;
    symbolDeclared?: boolean | null;
  };
  cache?: {
    status: 'ready' | 'missing' | 'unavailable';
    purl: string;
  };
  anchor?: {
    resolution: 'exact' | 'file-only' | 'ambiguous' | 'missing';
    nodeId?: string;
    label?: string;
    source_file?: string;
    source_location?: string;
    candidates?: Array<{ nodeId: string; label: string; source_file?: string }>;
  };
  construct?: {
    claimed: string;
    inferred: string;
    /** true = match, false = known mismatch, null = unconfirmed (inferred unknown). */
    match: boolean | null;
    evidence?: string[];
  };
  signature?: {
    match: boolean;
    skipped: boolean;
    skipCode?: string;
    reason?: string;
    claimed: { parameterTypes: string[]; returnTypes: string[] };
    inferred: { parameterTypes: string[]; returnTypes: string[] };
    /** Graphify `inline_parameter` marker count (anonymous eager args). */
    inlineParameters?: number;
  };
  declaration?: {
    freshness: 'fresh' | 'stale' | 'missing' | 'unanchored' | 'unchecked';
    ref?: {
      startLine: number;
      lineHash: string;
    };
  };
}

/** Shared affordance for clickable text pieces. */
const clickableStyle = {
  cursor: 'pointer',
  textDecorationLine: 'underline',
  textDecorationStyle: 'dotted',
  textUnderlineOffset: 2,
} as const;

/** Clickable detail-panel piece — dotted underline signals interactivity. */
function DetailLink({ children, onClick }: { children: ReactNode; onClick?: () => void }) {
  if (!onClick) return <>{children}</>;
  return (
    <span
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      style={{
        cursor: 'pointer',
        textDecorationLine: 'underline',
        textDecorationStyle: 'dotted',
        textUnderlineOffset: 2,
      }}
    >
      {children}
    </span>
  );
}

/** Panel props. Callbacks are wired by the graph; standalone usage without
 *  them renders the same panel with nothing clickable. */
export interface ComponentDeclarationProps {
  component: SubsystemComponent;
  /** File-path click → open that file in the bottom drawer (optional start line). */
  onOpenFile?: (file: string, opts?: SubsystemOpenFileOptions) => void;
  /** Related-name click (types, callers/callees, implementors, …) → select
   *  that component if one matches; unmatched refs no-op. */
  onRelatedSelect?: (ref: string) => void;
  /** Max width of the declaration panel (CSS value). Defaults to none. */
  maxWidth?: string | number;
  /** Live verification status for the selected component. */
  verification?: ComponentVerificationState | null;
  /** Start with the file path row visible (catalog / source-first views). */
  defaultShowFile?: boolean;
  /** True while this component's file is open in the host drawer — keeps the
   *  declaration visibly tied to the source being read. */
  fileOpen?: boolean;
  /** True when this component's own declaration line is the one highlighted in
   *  the open file (vs. a sibling construct sharing the same file). */
  declarationOpen?: boolean;
  /** Hide the repo/app identity (logo + name) — for hosts that render it once
   *  per purl group instead of on every declaration. */
  showRepoIdentity?: boolean;
  /** While the file row is visible, fold the declaration-line affordances into
   *  the file badge: drop the top-right `L#` (redundant) and put the
   *  description toggle in the badge after the line segment. */
  fileBadgeChrome?: boolean;
}

function verificationSummary(
  v: ComponentVerificationState,
  muted: string,
  ok: string,
  warn: string,
): { text: string; color: string } {
  if (v.phase === 'checking') {
    return { text: v.message ?? 'Verifying…', color: muted };
  }
  if (v.phase === 'error') {
    return { text: v.message ?? 'Verification failed', color: '#e5534b' };
  }
  if (v.phase !== 'done') {
    return { text: '', color: muted };
  }
  const bits: string[] = [];
  if (v.file) {
    if (!v.file.exists) bits.push('file missing');
    else if (v.file.symbolDeclared === false) bits.push('symbol not in graphify');
    else if (v.file.symbolDeclared === true) bits.push('file+symbol ok');
    else bits.push('file exists');
  }
  if (v.cache?.status === 'missing') {
    return {
      text: [...bits, 'graphify cache not ready — run graphify from Subsystems list'].join(' · '),
      color: warn,
    };
  }
  if (v.cache?.status === 'unavailable') {
    return {
      text: [...bits, 'no local checkout for this purl'].join(' · '),
      color: muted,
    };
  }
  const res = v.anchor?.resolution;
  if (res === 'exact') {
    const loc = v.anchor?.source_location ? ` @ ${v.anchor.source_location}` : '';
    const declFresh = v.declaration?.freshness;
    const declBit =
      declFresh && declFresh !== 'unanchored'
        ? ` · declaration ${declFresh}${v.declaration?.ref ? ` L${v.declaration.ref.startLine}` : ''}`
        : '';
    const anchorBit = `exact → ${v.anchor?.label ?? v.anchor?.nodeId ?? 'node'}${loc}${declBit}`;
    if (v.construct && v.construct.match !== true) {
      const unconfirmed = v.construct.match === null || v.construct.inferred === 'unknown';
      const why = unconfirmed
        ? `construct unconfirmed (claimed ${v.construct.claimed})`
        : `construct mismatch: claimed ${v.construct.claimed}, inferred ${v.construct.inferred}`;
      return {
        text: [...bits, anchorBit, why].join(' · '),
        color: unconfirmed ? warn : '#e5534b',
      };
    }
    if (v.signature && !v.signature.skipped && !v.signature.match) {
      const cParams = v.signature.claimed.parameterTypes.join(', ') || '∅';
      const iParams = v.signature.inferred.parameterTypes.join(', ') || '∅';
      const cRet = v.signature.claimed.returnTypes.join(', ') || '∅';
      const iRet = v.signature.inferred.returnTypes.join(', ') || '∅';
      return {
        text: [
          ...bits,
          anchorBit,
          v.construct?.match ? `construct ${v.construct.inferred}` : undefined,
          `signature mismatch: params [${cParams}]≠[${iParams}] return [${cRet}]≠[${iRet}]`,
        ]
          .filter(Boolean)
          .join(' · '),
        color: '#e5534b',
      };
    }
    const constructBit =
      v.construct?.match ? `construct ${v.construct.inferred}` : undefined;
    const inlineBit =
      v.signature?.inlineParameters
        ? `${v.signature.inlineParameters} inline param${v.signature.inlineParameters === 1 ? '' : 's'} verified`
        : undefined;
    if (v.signature?.skipped) {
      const skipPhrase: Record<string, string> = {
        no_claimed_types: 'no claimable named types (primitives/inline only)',
        generic_arg_only:
          'return only as generic_arg — wrapper types (Promise/Omit/Map/Array) not read as return edges',
        partially_generic_arg:
          'claimed types resolve only via generic_arg; rest unresolved',
        unresolved_claimed_types:
          'claimed return type has no graphify edge (npm/global/DOM type)',
      };
      return {
        text: [
          ...bits,
          anchorBit,
          ...(constructBit ? [constructBit] : []),
          ...(inlineBit ? [inlineBit] : []),
          v.signature.skipCode
            ? `params/return not fully checked — ${skipPhrase[v.signature.skipCode] ?? v.signature.skipCode}`
            : 'params/return not checked',
        ].join(' · '),
        color: warn,
      };
    }
    const sigBit =
      v.signature && v.signature.match ? 'params/return ok' : undefined;
    return {
      text: [...bits, anchorBit, ...(constructBit ? [constructBit] : []), ...(sigBit ? [sigBit] : [])].join(' · '),
      color: ok,
    };
  }
  if (res === 'file-only') {
    return {
      text: [...bits, 'file in graph, symbol not uniquely matched'].join(' · '),
      color: warn,
    };
  }
  if (res === 'ambiguous') {
    const n = v.anchor?.candidates?.length ?? 0;
    return {
      text: [...bits, `ambiguous (${n} candidates)`].join(' · '),
      color: warn,
    };
  }
  if (res === 'missing') {
    return {
      text: [...bits, 'no matching graphify node'].join(' · '),
      color: '#e5534b',
    };
  }
  return { text: bits.join(' · ') || 'done', color: muted };
}

/** Declaration panel for the selected component — its definition, code-style. */
export function ComponentDeclaration({
  component,
  onOpenFile,
  onRelatedSelect: _onRelatedSelect,
  maxWidth,
  verification,
  defaultShowFile = false,
  fileOpen = false,
  declarationOpen = false,
  showRepoIdentity = true,
  fileBadgeChrome = false,
}: ComponentDeclarationProps) {
  const { theme, mode } = useTheme();
  const pierreSyntaxTheme = resolvePierreSyntaxThemeName(mode);
  const [hoverSeg, setHoverSeg] = useState<
    'path' | 'line' | 'desc' | 'action' | null
  >(null);
  const [showFile, setShowFile] = useState(defaultShowFile);
  const [showPurpose, setShowPurpose] = useState(false);
  const muted = theme.colors.textMuted ?? theme.colors.textSecondary;
  const color = componentColor(component, pierreSyntaxTheme);
  const inlineChrome = fileBadgeChrome && showFile && !!component.file;
  const okColor = '#3d9a5f';
  const warnColor = theme.colors.textSecondary;

  const tokenColor: Record<SubsystemDeclTokenKind, string> = {
    keyword: theme.colors.secondary,
    name: color,
    member: theme.colors.info,
    type: theme.colors.accent,
    punctuation: muted,
    string: theme.colors.success,
    newline: '',
  };
  /** Fallback when wire tokens omit Shiki colors. */
  const declarationTextColor = muted;

  const declarationStartLine =
    component.declarationRef?.startLine ??
    verification?.declaration?.ref?.startLine ??
    parseSourceLocation(verification?.anchor?.source_location) ??
    undefined;

  const openDeclarationFile = () => {
    if (!onOpenFile || !component.file) return;
    onOpenFile(
      component.file,
      declarationStartLine != null ? { startLine: declarationStartLine } : undefined,
    );
  };

  const lineLocationLabel =
    declarationStartLine != null ? (
      <DetailLink onClick={onOpenFile ? openDeclarationFile : undefined}>
        <span
          style={{
            color: theme.colors.accent ?? color,
            fontFamily: theme.fonts.monospace,
            fontSize: theme.fontSizes[0],
            ...(onOpenFile ? clickableStyle : undefined),
          }}
        >
          L{declarationStartLine}
        </span>
      </DetailLink>
    ) : null;

  const line = (
    children: ReactNode,
    key?: string,
    indent?: boolean | number,
    wrap: 'pre' | 'pre-wrap' | 'normal' = 'pre-wrap',
  ) => {
    const paddingLeft = typeof indent === 'number' ? indent : indent ? 16 : 0;
    return (
      <div
        key={key}
        style={{
          display: 'flex',
          alignItems: wrap === 'normal' ? 'flex-start' : 'center',
          whiteSpace: wrap,
          overflowWrap: 'anywhere',
          minWidth: 0,
          minHeight: 18,
          ...(paddingLeft ? { paddingLeft } : {}),
        }}
      >
        {children}
      </div>
    );
  };
  const commentStyle = { color: muted, fontStyle: 'italic' } as const;
  const commentLine = (text: string, key?: string, indent?: boolean, onClick?: () => void) =>
    line(
      <DetailLink onClick={onClick}>
        <span style={{ ...commentStyle, ...(onClick ? clickableStyle : undefined) }}>{text}</span>
      </DetailLink>,
      key,
      indent,
    );
  const purposeStyle = {
    color: theme.colors.text,
    fontFamily: theme.fonts.body,
    fontSize: theme.fontSizes[1],
    lineHeight: 1.5,
    minWidth: 0,
    flex: 1,
  } as const;

  const lines: ReactNode[] = [];
  const ghMatch = /^pkg:github\/([^/]+)\/([^/#?]+)/.exec(component.purl ?? '');
  const toggleBtn = (on: boolean, onClick: () => void, title: string, Icon: typeof FileText) => (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 20,
        height: 20,
        padding: 0,
        border: 'none',
        borderRadius: 4,
        background: 'transparent',
        color: on ? theme.colors.accent : muted,
        cursor: 'pointer',
      }}
    >
      <Icon size={13} />
    </button>
  );
  const headerActions = (
    <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 2 }}>
      {!inlineChrome &&
        toggleBtn(showFile, () => setShowFile((v) => !v), 'Toggle file path', FileText)}
      {!inlineChrome && lineLocationLabel}
      {!inlineChrome &&
        component.purpose?.trim() &&
        toggleBtn(showPurpose, () => setShowPurpose((v) => !v), 'Toggle description', AlignLeft)}
    </span>
  );

  if (showRepoIdentity && ghMatch) {
    const [, ghOwner, ghRepo] = ghMatch;
    lines.push(
      line(
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%' }}>
          <img
            src={component.logo ?? `https://github.com/${ghOwner}.png?size=40`}
            alt=""
            width={18}
            height={18}
            style={{ borderRadius: 4, flexShrink: 0 }}
            onError={(e) => {
              e.currentTarget.style.display = 'none';
            }}
          />
          <span
            style={{
              color: theme.colors.textSecondary ?? muted,
              fontFamily: theme.fonts.body,
              fontSize: theme.fontSizes[1],
            }}
          >
            {ghRepo}
          </span>
          {headerActions}
        </span>,
        'repo',
      ),
    );
  } else if (showRepoIdentity && component.logo) {
    lines.push(
      line(
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%' }}>
          <img
            src={component.logo}
            alt=""
            width={18}
            height={18}
            style={{ borderRadius: 4, flexShrink: 0 }}
            onError={(e) => {
              e.currentTarget.style.display = 'none';
            }}
          />
          <span style={commentStyle}>{formatPurl(component.purl)}</span>
          {headerActions}
        </span>,
        'repo',
      ),
    );
  } else if (showRepoIdentity && component.purl) {
    lines.push(
      line(
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%' }}>
          <span style={commentStyle}>{`// ${formatPurl(component.purl)}`}</span>
          {headerActions}
        </span>,
        'purl',
      ),
    );
  } else if (!showRepoIdentity && !inlineChrome) {
    lines.push(line(headerActions, 'actions'));
  }

  if (verification && verification.phase !== 'idle') {
    const summary = verificationSummary(verification, muted, okColor, warnColor);
    if (summary.text) {
      lines.push(
        line(
          <span
            style={{
              color: summary.color,
              fontFamily: theme.fonts.body,
              fontSize: theme.fontSizes[0],
              whiteSpace: 'normal',
            }}
          >
            {summary.text}
          </span>,
          'verify-status',
        ),
      );
    }
    if (
      verification.anchor?.resolution === 'ambiguous' &&
      verification.anchor.candidates &&
      verification.anchor.candidates.length > 0
    ) {
      for (const c of verification.anchor.candidates.slice(0, 5)) {
        lines.push(
          commentLine(
            `//   ${c.label}${c.source_file ? ` — ${c.source_file}` : ''}`,
            `cand-${c.nodeId}`,
          ),
        );
      }
    }
    if (verification.signature?.skipped && verification.signature.reason) {
      lines.push(
        commentLine(
          `// why: ${verification.signature.reason}`,
          'verify-skip-reason',
        ),
      );
    }
  }

  if (showFile && component.file) {
    const fileInteractive = !!onOpenFile;
    const fileSegHovered =
      hoverSeg === 'path' || hoverSeg === 'line' || hoverSeg === 'action';
    const segBorder =
      fileOpen || (fileInteractive && fileSegHovered)
        ? theme.colors.accent ?? color
        : theme.colors.border;
    const segBg = (seg: 'path' | 'line' | 'desc' | 'action') =>
      hoverSeg === seg ? theme.colors.border : 'transparent';
    const segHover = (seg: 'path' | 'line' | 'desc' | 'action') => ({
      onMouseEnter: () => setHoverSeg(seg),
      onMouseLeave: () => setHoverSeg((s) => (s === seg ? null : s)),
    });
    const segStyle = {
      display: 'inline-flex',
      alignItems: 'center',
      transition: 'background 100ms ease',
    } as const;
    const openAt = fileInteractive
      ? (e: { stopPropagation: () => void }) => {
          e.stopPropagation();
          openDeclarationFile();
        }
      : undefined;
    lines.push(
      line(
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'stretch',
              borderRadius: 6,
              overflow: 'hidden',
              border: `1px solid ${segBorder}`,
              background: theme.colors.backgroundSecondary ?? 'transparent',
              whiteSpace: 'nowrap',
            }}
          >
            <span
              role={fileInteractive ? 'button' : undefined}
              tabIndex={fileInteractive ? 0 : undefined}
              title={fileInteractive ? `Open ${component.file}` : component.file}
              onClick={openAt}
              {...segHover('path')}
              style={{
                ...segStyle,
                padding: '1px 8px',
                background: segBg('path'),
                color:
                  hoverSeg === 'path' && fileInteractive
                    ? theme.colors.text
                    : theme.colors.textSecondary ?? muted,
                fontFamily: theme.fonts.monospace,
                fontSize: theme.fontSizes[0],
                cursor: fileInteractive ? 'pointer' : 'default',
              }}
            >
              {component.file}
            </span>
            {declarationStartLine != null && (
              <span
                role={fileInteractive ? 'button' : undefined}
                tabIndex={fileInteractive ? 0 : undefined}
                title="Open at declaration line"
                onClick={openAt}
                {...segHover('line')}
                style={{
                  ...segStyle,
                  padding: '1px 6px',
                  borderLeft: `1px solid ${segBorder}`,
                  background: segBg('line'),
                  color: theme.colors.accent ?? color,
                  fontFamily: theme.fonts.monospace,
                  fontSize: theme.fontSizes[0],
                  cursor: fileInteractive ? 'pointer' : 'default',
                }}
              >
                L{declarationStartLine}
              </span>
            )}
            {inlineChrome && component.purpose?.trim() && (
              <button
                type="button"
                title={showPurpose ? 'Hide description' : 'Show description'}
                aria-label={showPurpose ? 'Hide description' : 'Show description'}
                onClick={(e) => {
                  e.stopPropagation();
                  setShowPurpose((v) => !v);
                }}
                {...segHover('desc')}
                style={{
                  ...segStyle,
                  justifyContent: 'center',
                  padding: '0 6px',
                  border: 'none',
                  borderLeft: `1px solid ${segBorder}`,
                  background: segBg('desc'),
                  color: showPurpose
                    ? theme.colors.accent ?? color
                    : theme.colors.textSecondary ?? muted,
                  cursor: 'pointer',
                }}
              >
                <AlignLeft size={12} />
              </button>
            )}
            {fileOpen &&
              (declarationOpen ? (
                <span
                  role={fileInteractive ? 'button' : undefined}
                  tabIndex={fileInteractive ? 0 : undefined}
                  title={fileInteractive ? 'Close file' : 'This declaration is shown below'}
                  onClick={openAt}
                  {...segHover('action')}
                  style={{
                    ...segStyle,
                    padding: '1px 6px',
                    borderLeft: `1px solid ${segBorder}`,
                    background: segBg('action'),
                    color: theme.colors.accent ?? color,
                    fontFamily: theme.fonts.monospace,
                    fontSize: theme.fontSizes[0] * 0.85,
                    letterSpacing: 0.4,
                    textTransform: 'uppercase',
                    cursor: fileInteractive ? 'pointer' : 'default',
                  }}
                >
                  {hoverSeg === 'action' && fileInteractive ? 'close' : 'open'}
                </span>
              ) : fileInteractive ? (
                <span
                  role="button"
                  tabIndex={0}
                  title="Go to this declaration in the open file"
                  onClick={openAt}
                  {...segHover('action')}
                  style={{
                    ...segStyle,
                    padding: '1px 6px',
                    borderLeft: `1px solid ${segBorder}`,
                    background: segBg('action'),
                    color: theme.colors.accent ?? color,
                    fontFamily: theme.fonts.monospace,
                    fontSize: theme.fontSizes[0] * 0.85,
                    letterSpacing: 0.4,
                    textTransform: 'uppercase',
                    cursor: 'pointer',
                  }}
                >
                  go to
                </span>
              ) : null)}
          </span>
        </span>,
        'file',
      ),
    );
  }

  const containerRef = useRef<HTMLDivElement>(null);
  const [printWidth, setPrintWidth] = useState(80);

  // The "open" segment flips to "close" on hover; clear that when the file
  // closes so a later open doesn't render "close" while unhovered.
  useEffect(() => {
    if (!fileOpen) setHoverSeg((s) => (s === 'action' ? null : s));
  }, [fileOpen]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    function measureWidth() {
      const probe = document.createElement('div');
      probe.style.cssText =
        'position:absolute;visibility:hidden;white-space:pre;' +
        `font-family:${getComputedStyle(el!).fontFamily};` +
        `font-size:${getComputedStyle(el!).fontSize};` +
        'line-height:1;width:auto';
      probe.textContent = 'x';
      document.body.appendChild(probe);
      const ch = probe.getBoundingClientRect().width || 8.4;
      document.body.removeChild(probe);
      setPrintWidth(Math.max(40, Math.floor(el!.clientWidth / ch)));
    }

    measureWidth();
    const ro = new ResizeObserver(measureWidth);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const [tokens, setTokens] = useState(component.tokens ?? []);
  useEffect(() => {
    if (component.tokens) {
      setTokens(component.tokens);
      return;
    }
    let cancelled = false;
    tokenizeComponent(component, printWidth, pierreSyntaxTheme)
      .then((t) => {
        if (!cancelled) setTokens(t);
      })
      .catch((err) => {
        console.error(
          '[subsystem-declaration] tokenize failed',
          component.alias,
          err,
        );
      });
    return () => {
      cancelled = true;
    };
  }, [component, printWidth, pierreSyntaxTheme]);
  const declLines: ReactNode[][] = [[]];
  let di = 0;
  for (const tok of tokens) {
    if (tok.kind === 'newline') {
      declLines.push([]);
      di++;
      continue;
    }
    declLines[di].push(
      <span
        key={`${di}-${declLines[di].length}`}
        style={{ color: tok.color ?? tokenColor[tok.kind] ?? declarationTextColor }}
      >
        {tok.text}
      </span>,
    );
  }
  for (let li = 0; li < declLines.length; li++) {
    if (declLines[li].length === 0) continue;
    lines.push(
      <div
        key={`decl-${li}`}
        style={{
          // Block (not flex): tokens flow inline and wrap at spaces. A flex
          // row lets each token span shrink and break mid-word when a line
          // overflows (e.g. the unformatted prettier-fallback declaration).
          display: 'block',
          whiteSpace: 'pre-wrap',
          overflowWrap: 'anywhere',
          minWidth: 0,
          minHeight: 18,
        }}
      >
        {declLines[li]}
      </div>,
    );
  }

  if (showPurpose && component.purpose) {
    lines.push(line(<div style={{ height: 6 }} />, 'purpose-gap', false, 'normal'));
    component.purpose.split('\n').forEach((purposeLine, i) =>
      lines.push(
        line(
          <span style={purposeStyle} key={`purpose${i}`}>
            {purposeLine.trim()}
          </span>,
          `purpose${i}`,
          false,
          'normal',
        ),
      ),
    );
  }

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        minWidth: 0,
        boxSizing: 'border-box',
        background: theme.colors.backgroundSecondary,
        padding: '10px 12px',
        fontFamily: theme.fonts.monospace,
        fontSize: theme.fontSizes[1],
        lineHeight: 1.7,
        overflowWrap: 'anywhere',
        ...(maxWidth != null ? { maxWidth } : {}),
      }}
    >
      {lines}
    </div>
  );
}
