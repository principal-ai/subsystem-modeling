/**
 * SymbolInspectionCard — the declaration of a symbol referenced by a
 * declaration panel, resolved through graphify. Rendered as a popover from the
 * declaration panel.
 *
 * The useful payload is the declaration itself (`inspection.declaration`,
 * rebuilt from graph edges), with `source` as the fallback. `resolution` and
 * `candidates` explain a miss. The "Add to references" affordance is
 * intentionally hidden until it's wired up (`onAddToModel` is accepted but not
 * rendered yet).
 */

import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { ExternalLink } from 'lucide-react';
import { useTheme } from '@principal-ade/industry-theme';
import { resolvePierreSyntaxThemeName } from '../pierre/pierreSyntaxTheme';
import { sourceLangForPath, type SourceSyntaxLang } from '../pierre/sourceLang';
import type { SubsystemOpenFileOptions } from './declarationRef';
import { parseSourceLocation } from './declarationRef';
import { generateDeclarationString } from './formatDeclaration';
import type {
  SubsystemComponent,
  SubsystemComponentConstruct,
  SubsystemDeclToken,
} from './model';
import { tokenizeComponent } from './tokenizeComponent';
import { tokenizeFormatted } from './tokenizeFormatted';
import type { DeclarationSymbolRef, SymbolInspection } from './symbolRefs';

export interface SymbolInspectionCardProps {
  /** The symbol that was clicked. */
  symbolRef: DeclarationSymbolRef;
  /** Graphify result; absent when the lookup failed. */
  inspection?: SymbolInspection | null;
  error?: string;
  onClose?: () => void;
  /** Add the symbol to the model's references (for an agent to maintain).
   *  Accepted but not rendered yet — wired in a later slice. */
  onAddToModel?: (ref: DeclarationSymbolRef, info?: SymbolInspection) => void;
  /** Open the definition file at its line. */
  onOpenFile?: (file: string, opts?: SubsystemOpenFileOptions) => void;
  style?: CSSProperties;
}

/**
 * A repo path that wraps at `/` only. Each segment is unbreakable, so the
 * browser can't fall back to breaking at a hyphen (`event-` / `processing`);
 * the `<wbr>` after each slash supplies the break opportunity instead.
 */
function WrappablePath({ path }: { path: string }) {
  const nodes: ReactNode[] = [];
  path.split('/').forEach((seg, i) => {
    if (i > 0) {
      nodes.push('/');
      nodes.push(<wbr key={`b${i}`} />);
    }
    nodes.push(
      <span key={`s${i}`} style={{ whiteSpace: 'nowrap' }}>
        {seg}
      </span>,
    );
  });
  return <>{nodes}</>;
}

/** Label stacked above the value, so long values get the full width. */
function StackedRow({
  label,
  children,
  labelSize,
}: {
  label: string;
  children: ReactNode;
  labelSize?: number;
}) {
  const { theme } = useTheme();
  const muted = theme.colors.textMuted ?? theme.colors.textSecondary;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span
        style={{
          color: muted,
          fontFamily: theme.fonts.body,
          fontSize: labelSize ?? theme.fontSizes[0],
          textTransform: 'uppercase',
          letterSpacing: 0.4,
        }}
      >
        {label}
      </span>
      <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{children}</span>
    </div>
  );
}

/** Map a graphify declaration kind to the construct the renderer expects. */
function constructForDeclaration(info: SymbolInspection): SubsystemComponentConstruct {
  const d = info.declaration;
  switch (d?.kind) {
    case 'class':
      return 'class';
    case 'function':
      return 'function';
    case 'method':
      return 'method';
    case 'store':
      return 'store';
    case 'external':
      return 'external';
    case 'custom_entity':
      return 'custom_entity';
    case 'type':
      if (d.enumMembers?.length) return 'enum';
      if (d.rhs || d.aliasOf || d.unionOf?.length || d.signature) return 'type_alias';
      return 'interface';
    default:
      return 'interface';
  }
}

/**
 * A valid TS identifier used while generating/formatting the declaration, then
 * swapped for the real symbol name on display. Graphify labels aren't always
 * valid identifiers (`capture-session`), which would make Prettier's parser
 * throw and skip formatting.
 */
const SYMBOL_PLACEHOLDER = '__SYMBOL__';

/** Build a renderable component from the inspection's structured declaration. */
function componentForInspection(info: SymbolInspection): SubsystemComponent | null {
  if (!info.declaration) return null;
  return {
    alias: info.symbol,
    name: SYMBOL_PLACEHOLDER,
    construct: constructForDeclaration(info),
    file: info.node?.sourceFile ?? '',
    purl: info.purl ?? '',
    declaration: info.declaration,
  };
}

/** Put the real symbol name back into a generated/formatted declaration. */
function withSymbolName(text: string, symbol: string): string {
  return text.split(SYMBOL_PLACEHOLDER).join(symbol);
}

type Theme = ReturnType<typeof useTheme>['theme'];

/** Typography for the declaration text — the section supplies the framing. */
function declBlockStyle(theme: Theme): CSSProperties {
  return {
    fontFamily: theme.fonts.monospace,
    fontSize: theme.fontSizes[1],
    lineHeight: 1.6,
    whiteSpace: 'pre-wrap',
    overflowWrap: 'anywhere',
  };
}

/**
 * Token stream → per-line colored spans, substituting a placeholder name. Each
 * line is its own block: token text carries no newline (the `newline` token is
 * a marker), so without a block per line everything collapses onto one row.
 */
function renderTokenLines(
  tokens: SubsystemDeclToken[],
  theme: Theme,
  symbol?: string,
): ReactNode[] {
  const lines: ReactNode[][] = [[]];
  let li = 0;
  for (const tok of tokens) {
    if (tok.kind === 'newline') {
      lines.push([]);
      li++;
      continue;
    }
    const text = symbol ? tok.text.split(SYMBOL_PLACEHOLDER).join(symbol) : tok.text;
    lines[li].push(
      <span
        key={`${li}-${lines[li].length}`}
        style={{ color: tok.color ?? theme.colors.text }}
      >
        {text}
      </span>,
    );
  }
  return lines
    .filter((spans) => spans.length > 0)
    .map((spans, i) => (
      <div key={i} style={{ minHeight: '1em' }}>
        {spans}
      </div>
    ));
}

/**
 * The declaration, syntax-colored via the same Shiki/Pierre pipeline as the
 * main panel. Falls back to the plain generated string until tokens arrive.
 */
function DeclarationPreview({ info }: { info: SymbolInspection }) {
  const { theme, mode } = useTheme();
  const [tokens, setTokens] = useState<SubsystemDeclToken[] | null>(null);
  const component = useMemo(() => componentForInspection(info), [info]);
  const fallbackText = useMemo(
    () => (component ? withSymbolName(generateDeclarationString(component), info.symbol) : ''),
    [component, info.symbol],
  );

  useEffect(() => {
    if (!component) return;
    let cancelled = false;
    tokenizeComponent(component, 40, resolvePierreSyntaxThemeName(mode))
      .then((t) => {
        if (!cancelled) setTokens(t);
      })
      .catch(() => {
        if (!cancelled) setTokens(null);
      });
    return () => {
      cancelled = true;
    };
  }, [component, mode]);

  return (
    <div style={declBlockStyle(theme)}>
      {tokens ? renderTokenLines(tokens, theme, info.symbol) : fallbackText}
    </div>
  );
}

/** Raw source declaration text, syntax-colored with the file's grammar. */
function TokenizedSource({ code, lang }: { code: string; lang: SourceSyntaxLang }) {
  const { theme, mode } = useTheme();
  const [tokens, setTokens] = useState<SubsystemDeclToken[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    tokenizeFormatted(code, resolvePierreSyntaxThemeName(mode), lang)
      .then((t) => {
        if (!cancelled) setTokens(t);
      })
      .catch(() => {
        if (!cancelled) setTokens(null);
      });
    return () => {
      cancelled = true;
    };
  }, [code, lang, mode]);

  return (
    <div style={declBlockStyle(theme)}>
      {tokens ? renderTokenLines(tokens, theme) : code}
    </div>
  );
}

/** Popover showing the declaration of one referenced symbol. */
export function SymbolInspectionCard({
  symbolRef,
  inspection,
  error,
  onClose,
  onOpenFile,
  style,
}: SymbolInspectionCardProps) {
  const { theme } = useTheme();
  const muted = theme.colors.textMuted ?? theme.colors.textSecondary;
  const mono = theme.fonts.monospace;
  const small = theme.fontSizes[0];
  const body = theme.fontSizes[1];
  const [hoveredCandidate, setHoveredCandidate] = useState<string | null>(null);

  const info = inspection ?? undefined;
  const node = info?.node;
  const line = parseSourceLocation(node?.sourceLocation);
  // Structured declaration when graphify reconstructed it; otherwise the raw
  // source declaration when only the location is known.
  const component = info ? componentForInspection(info) : null;
  const sourceText = info?.source?.text ?? null;
  // The declaration block already carries the symbol's name, so only fall back
  // to a header title when there's nothing to show (loading / miss).
  const hasBody = !!component || !!sourceText;
  // What to say when there's no declaration: ambiguous is "pick one", not a
  // dead end — so it must not read as "no declaration available".
  const statusText = !info
    ? 'Nothing in graphify for this symbol.'
    : info.candidates && info.candidates.length > 0
      ? `Multiple definitions match (${info.candidates.length}).`
      : `No declaration available from graphify${info.reason ? ` — ${info.reason}` : '.'}`;

  const openFile = () => {
    if (!onOpenFile || !node?.sourceFile) return;
    onOpenFile(node.sourceFile, line != null ? { startLine: line } : undefined);
  };

  return (
    <div
      data-symbol-inspection
      style={{
        position: 'absolute',
        zIndex: 60,
        width: 360,
        maxWidth: 'calc(100vw - 24px)',
        maxHeight: 'min(70vh, 560px)',
        boxSizing: 'border-box',
        background: theme.colors.backgroundSecondary,
        border: `1px solid ${theme.colors.border}`,
        borderRadius: 8,
        overflowY: 'auto',
        boxShadow: '0 8px 24px rgba(0, 0, 0, 0.28)',
        fontFamily: mono,
        fontSize: body,
        color: theme.colors.text,
        ...style,
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        style={{
          position: 'absolute',
          top: 6,
          right: 8,
          zIndex: 1,
          border: 'none',
          background: 'transparent',
          color: muted,
          cursor: 'pointer',
          fontSize: 15,
          lineHeight: 1,
          padding: '2px 4px',
        }}
      >
        ×
      </button>

      {/* Top: the declaration itself, full-bleed (or status when there's none). */}
      <div
        style={{
          padding: '12px 32px 12px 12px',
          borderBottom: `1px solid ${theme.colors.border}`,
        }}
      >
        {error && (
          <span style={{ color: '#e5534b', fontFamily: theme.fonts.body, fontSize: small }}>
            {error}
          </span>
        )}

        {!error && component && info && (
          <DeclarationPreview key={info.symbol} info={info} />
        )}

        {!error && !component && sourceText && (
          <TokenizedSource
            key={info?.symbol}
            code={sourceText}
            lang={sourceLangForPath(info?.source?.file ?? info?.node?.sourceFile ?? '')}
          />
        )}

        {!error && !hasBody && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ color: theme.colors.accent ?? theme.colors.secondary, fontWeight: 600 }}>
              {symbolRef.name}
            </span>
            <span style={{ color: muted, fontFamily: theme.fonts.body, fontSize: body }}>
              {statusText}
            </span>
          </div>
        )}
      </div>

      {/* Meta: where it lives, ambiguity, and the action. */}
      {!error && (
        <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {node?.sourceFile && (
          <StackedRow label="Source">
            {onOpenFile ? (
              <span
                role="button"
                tabIndex={0}
                onClick={openFile}
                style={{
                  cursor: 'pointer',
                  color: theme.colors.accent ?? theme.colors.secondary,
                }}
              >
                <WrappablePath path={node.sourceFile} />
                {line != null ? `:${line}` : ''}{' '}
                <ExternalLink
                  size={11}
                  style={{ display: 'inline', verticalAlign: 'text-bottom' }}
                />
              </span>
            ) : (
              <span>
                <WrappablePath path={node.sourceFile} />
                {line != null ? `:${line}` : ''}
              </span>
            )}
          </StackedRow>
        )}

        {info?.candidates && info.candidates.length > 0 && (
          <StackedRow label="Candidates" labelSize={body}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {info.candidates.slice(0, 6).map((c) =>
                // Ambiguous candidates share the symbol name, so the file is
                // the only thing that distinguishes them.
                c.sourceFile ? (
                  <span
                    key={c.nodeId}
                    role={onOpenFile ? 'button' : undefined}
                    tabIndex={onOpenFile ? 0 : undefined}
                    onClick={onOpenFile ? () => onOpenFile(c.sourceFile!, undefined) : undefined}
                    onMouseEnter={
                      onOpenFile ? () => setHoveredCandidate(c.nodeId) : undefined
                    }
                    onMouseLeave={
                      onOpenFile
                        ? () => setHoveredCandidate((h) => (h === c.nodeId ? null : h))
                        : undefined
                    }
                    style={{
                      fontFamily: mono,
                      fontSize: body,
                      color: theme.colors.accent ?? theme.colors.secondary,
                      cursor: onOpenFile ? 'pointer' : 'default',
                      textDecorationLine:
                        onOpenFile && hoveredCandidate === c.nodeId ? 'underline' : 'none',
                      textUnderlineOffset: 2,
                    }}
                  >
                    <WrappablePath path={c.sourceFile} />
                  </span>
                ) : (
                  <span
                    key={c.nodeId}
                    style={{ fontFamily: mono, fontSize: body, color: theme.colors.text }}
                  >
                    {c.label}
                  </span>
                ),
              )}
            </div>
          </StackedRow>
        )}

        </div>
      )}
    </div>
  );
}
