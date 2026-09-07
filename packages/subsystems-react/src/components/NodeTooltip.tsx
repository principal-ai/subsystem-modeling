import React, { useEffect, useState, useContext } from 'react';
import { createPortal } from 'react-dom';
import { useTheme } from '@principal-ade/industry-theme';
import { IndustryMarkdownSlide } from 'themed-markdown';
import { TooltipPortalContext } from '../contexts/TooltipPortalContext';

export interface OtelInfo {
  kind: 'type' | 'service' | 'instance';
  category?: string;
  scope?: string;
  files?: string[];
}

export interface NodeTooltipProps {
  description?: string;
  otel?: OtelInfo;
  /** @deprecated Use otel.files instead */
  sources?: string[];
  /** External references (packages, documentation links) */
  references?: string[];
  visible: boolean;
  /** Reference to the node element for positioning */
  nodeRef?: React.RefObject<HTMLDivElement>;
}

/**
 * Tooltip component for displaying node information on hover
 * Uses a portal to render above all other elements
 */
export const NodeTooltip: React.FC<NodeTooltipProps> = ({
  description,
  otel,
  sources,
  references,
  visible,
  nodeRef,
}) => {
  const { theme } = useTheme();
  const portalTarget = useContext(TooltipPortalContext);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    if (visible && nodeRef?.current && portalTarget) {
      const nodeRect = nodeRef.current.getBoundingClientRect();
      const containerRect = portalTarget.getBoundingClientRect();
      // Position relative to the container, not the viewport
      setPosition({
        top: nodeRect.bottom - containerRect.top + 8, // 8px below the node
        left: nodeRect.left - containerRect.left + nodeRect.width / 2, // centered horizontally
      });
    } else if (visible && nodeRef?.current && !portalTarget) {
      // Fallback to viewport positioning if no portal target
      const rect = nodeRef.current.getBoundingClientRect();
      setPosition({
        top: rect.bottom + 8,
        left: rect.left + rect.width / 2,
      });
    } else if (!nodeRef) {
      // No ref provided - will use relative positioning (for storybook demos)
      setPosition({ top: 0, left: 0 });
    }
  }, [visible, nodeRef, portalTarget]);

  if (!visible) return null;

  // If no nodeRef, render inline (for storybook demos)
  const usePortal = Boolean(nodeRef);

  const getKindLabel = (kind: string) => {
    switch (kind) {
      case 'type':
        return 'Type';
      case 'service':
        return 'Service';
      case 'instance':
        return 'Instance';
      default:
        return kind;
    }
  };

  const getKindColor = (kind: string) => {
    switch (kind) {
      case 'type':
        return '#4A90E2'; // Blue
      case 'service':
        return '#7ED321'; // Green
      case 'instance':
        return '#9B59B6'; // Purple
      default:
        return '#888';
    }
  };

  const renderTooltipContent = (): React.JSX.Element => (
    <div
      style={{
        // Use absolute positioning relative to portal target container
        position: usePortal ? 'absolute' : 'absolute',
        top: usePortal ? position?.top ?? 0 : '100%',
        left: usePortal ? position?.left ?? 0 : '50%',
        transform: 'translateX(-50%)',
        marginTop: usePortal ? 0 : '8px',
        padding: '8px 12px',
        backgroundColor: 'rgba(0, 0, 0, 0.9)',
        color: 'white',
        borderRadius: '6px',
        fontSize: theme.fontSizes[0],
        fontFamily: theme.fonts.body,
        maxWidth: '400px',
        maxHeight: '500px',
        zIndex: 99999,
        pointerEvents: 'none',
        boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
        whiteSpace: 'normal',
        opacity: usePortal ? (position ? 1 : 0) : 1,
        overflow: 'auto',
      }}
    >
      {/* Arrow */}
      <div
        style={{
          position: 'absolute',
          top: '-6px',
          left: '50%',
          transform: 'translateX(-50%)',
          width: 0,
          height: 0,
          borderLeft: '6px solid transparent',
          borderRight: '6px solid transparent',
          borderBottom: '6px solid rgba(0, 0, 0, 0.9)',
        }}
      />

      {/* OTEL Badge */}
      {otel && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            marginBottom: description || otel.scope ? '6px' : 0,
          }}
        >
          <span
            style={{
              backgroundColor: getKindColor(otel.kind),
              color: 'white',
              padding: '2px 6px',
              borderRadius: '3px',
              fontSize: theme.fontSizes[0],
              fontWeight: theme.fontWeights.semibold,
              fontFamily: theme.fonts.body,
              textTransform: 'uppercase',
            }}
          >
            {getKindLabel(otel.kind)}
          </span>
          {otel.category && (
            <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: theme.fontSizes[0], fontFamily: theme.fonts.body }}>
              {otel.category}
            </span>
          )}
        </div>
      )}

      {/* Scope */}
      {otel?.scope && (
        <div style={{
          marginBottom: description ? '6px' : 0,
          fontSize: theme.fontSizes[0],
          fontFamily: theme.fonts.body,
          color: 'rgba(255,255,255,0.8)'
        }}>
          <span style={{
            color: 'rgba(255,255,255,0.6)',
            fontWeight: theme.fontWeights.semibold
          }}>
            Scope:
          </span>{' '}
          <span style={{ fontFamily: 'monospace' }}>{otel.scope}</span>
        </div>
      )}

      {/* Description - rendered as markdown */}
      {description ? (
        <div style={{ lineHeight: '1.4', color: 'rgba(255,255,255,0.9)' }}>
          <IndustryMarkdownSlide
            content={description}
            slideIdPrefix="tooltip"
            slideIndex={0}
            isVisible={true}
            theme={{
              ...theme,
              colors: {
                ...theme.colors,
                background: 'transparent',
                text: 'rgba(255,255,255,0.9)',
              },
            }}
            transparentBackground={true}
            disableScroll={true}
            fontSizeScale={0.85}
            enableKeyboardScrolling={false}
            autoFocusOnVisible={false}
          />
        </div>
      ) : (
        <div style={{ lineHeight: '1.4', color: 'rgba(255,255,255,0.5)' }}>
          No description
        </div>
      )}

      {/* Source Files - from otel.files or deprecated sources */}
      {(() => {
        const sourceFiles = otel?.files || sources;
        if (!sourceFiles || sourceFiles.length === 0) return null;
        return (
          <div style={{ marginTop: '8px', borderTop: '1px solid rgba(255,255,255,0.2)', paddingTop: '6px' }}>
            <div style={{
              fontSize: theme.fontSizes[0],
              fontWeight: theme.fontWeights.semibold,
              color: 'rgba(255,255,255,0.7)',
              marginBottom: '4px'
            }}>
              Source Files:
            </div>
            <div style={{ fontSize: theme.fontSizes[0], color: 'rgba(255,255,255,0.8)' }}>
              {sourceFiles.map((file, index) => (
                <div key={index} style={{
                  fontFamily: 'monospace',
                  fontSize: theme.fontSizes[0],
                  marginTop: index > 0 ? '2px' : 0,
                  wordBreak: 'break-all'
                }}>
                  {file}
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {/* References - external packages/documentation */}
      {references && references.length > 0 && (
        <div style={{ marginTop: '8px', borderTop: '1px solid rgba(255,255,255,0.2)', paddingTop: '6px' }}>
          <div style={{
            fontSize: theme.fontSizes[0],
            fontWeight: theme.fontWeights.semibold,
            color: 'rgba(255,255,255,0.7)',
            marginBottom: '4px'
          }}>
            References:
          </div>
          <div style={{ fontSize: theme.fontSizes[0], color: 'rgba(255,255,255,0.8)' }}>
            {references.map((ref, index) => (
              <div key={index} style={{
                fontFamily: 'monospace',
                fontSize: theme.fontSizes[0],
                marginTop: index > 0 ? '2px' : 0,
                wordBreak: 'break-all'
              }}>
                {ref}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  // Use portal to render in the graph container when available, otherwise render inline
  if (usePortal) {
    // Portal to graph container (hides with tab) or fallback to body
    const target = portalTarget || document.body;
    return createPortal(renderTooltipContent(), target);
  }
  return renderTooltipContent();
};
