/**
 * Node content component - renders icon, name, identifier, state, violations, and workflow chips
 */

import React from 'react';
import { useTheme } from '@principal-ade/industry-theme';
import { resolveIcon } from '../../../utils/iconResolver';
import type { NodeContentProps, WorkflowChip } from './types';

/**
 * Helper to render text with word break opportunities after dots
 */
function renderWithDotBreaks(text: string): React.ReactNode {
  const parts = text.split('.');
  return parts.map((part, i) => (
    <span key={i}>
      {part}
      {i < parts.length - 1 && (
        <>
          .<wbr />
        </>
      )}
    </span>
  ));
}

/**
 * Workflow chips component for span convention nodes
 */
const WorkflowChips: React.FC<{
  chips: WorkflowChip[];
  onChipClick?: (chipId: string) => void;
  selectedChipId?: string;
}> = ({ chips, onChipClick, selectedChipId }) => {
  const { theme } = useTheme();

  if (!chips || chips.length === 0) return null;

  // Show max 3 chips, then "+N more"
  const maxVisible = 3;
  const visibleChips = chips.slice(0, maxVisible);
  const remainingCount = chips.length - maxVisible;

  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: '3px',
        marginTop: '4px',
        justifyContent: 'center',
        maxWidth: '100%',
      }}
    >
      {visibleChips.map((chip) => {
        const isSelected = selectedChipId === chip.id;
        const hasColor = !!chip.color;

        return (
          <div
            key={chip.id}
            onClick={(e) => {
              e.stopPropagation();
              onChipClick?.(chip.id);
            }}
            style={{
              fontSize: theme.fontSizes[0] * 0.65,
              padding: '1px 5px',
              borderRadius: '6px',
              backgroundColor: isSelected
                ? chip.color || '#3b82f6'
                : chip.color
                  ? `${chip.color}33` // 20% opacity version
                  : 'rgba(0,0,0,0.08)',
              color: isSelected
                ? '#fff'
                : hasColor
                  ? chip.color
                  : 'rgba(0,0,0,0.6)',
              whiteSpace: 'nowrap',
              maxWidth: '70px',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              cursor: onChipClick ? 'pointer' : 'default',
              fontWeight: isSelected ? theme.fontWeights.bold : theme.fontWeights.medium,
              transition: 'all 0.15s ease',
              border: isSelected ? 'none' : `1px solid ${hasColor ? `${chip.color}66` : 'rgba(0,0,0,0.1)'}`,
            }}
            title={chip.label}
          >
            {chip.label}
          </div>
        );
      })}
      {remainingCount > 0 && (
        <div
          style={{
            fontSize: theme.fontSizes[0] * 0.65,
            padding: '1px 5px',
            borderRadius: '6px',
            backgroundColor: 'rgba(0,0,0,0.05)',
            color: 'rgba(0,0,0,0.5)',
            whiteSpace: 'nowrap',
          }}
          title={`${remainingCount} more workflow${remainingCount > 1 ? 's' : ''}`}
        >
          +{remainingCount}
        </div>
      )}
    </div>
  );
};

/**
 * Node content component - renders the inner content of a node
 */
export const NodeContent: React.FC<NodeContentProps> = ({
  displayName,
  identifier,
  icon,
  state,
  stateDefinitions,
  hasViolations,
  centered = true,
  workflowChips,
  onWorkflowChipClick,
  selectedWorkflowId,
}) => {
  const { theme } = useTheme();

  // Show identifier if it differs from display name
  const showIdentifier = identifier && identifier !== displayName;

  // Get state label from definitions
  const stateLabel = state && stateDefinitions?.[state]?.label;

  return (
    <>
      {/* Icon */}
      {icon && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          {resolveIcon(icon, 20)}
        </div>
      )}

      {/* Name with optional identifier */}
      <div style={{ textAlign: centered ? 'center' : 'left', wordBreak: 'break-word' }}>
        <div>{displayName}</div>
        {showIdentifier && (
          <div
            style={{
              fontSize: theme.fontSizes[0] * 0.75,
              color: 'rgba(0, 0, 0, 0.5)',
              marginTop: '2px',
              fontFamily: theme.fonts.monospace,
            }}
          >
            {renderWithDotBreaks(identifier)}
          </div>
        )}
      </div>

      {/* Workflow chips (for span convention nodes) */}
      {workflowChips && workflowChips.length > 0 && (
        <WorkflowChips
          chips={workflowChips}
          onChipClick={onWorkflowChipClick}
          selectedChipId={selectedWorkflowId}
        />
      )}

      {/* State badge */}
      {state && (
        <div
          style={{
            fontSize: theme.fontSizes[0],
            fontFamily: theme.fonts.body,
            backgroundColor: '#888', // Color will be passed from parent
            color: 'white',
            padding: '2px 6px',
            borderRadius: '4px',
            textAlign: 'center',
          }}
        >
          {stateLabel || state}
        </div>
      )}

      {/* Violations indicator */}
      {hasViolations && (
        <div
          style={{
            fontSize: theme.fontSizes[0],
            fontFamily: theme.fonts.body,
            color: '#D0021B',
            fontWeight: theme.fontWeights.bold,
          }}
        >
          ⚠️
        </div>
      )}
    </>
  );
};
