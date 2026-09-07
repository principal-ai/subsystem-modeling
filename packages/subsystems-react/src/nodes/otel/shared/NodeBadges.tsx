/**
 * Node badges component for status, sources, references, and boundary indicators
 */

import React from 'react';
import { useTheme } from '@principal-ade/industry-theme';
import type { NodeBadgesProps, BadgePosition, BoundaryData } from './types';

/**
 * Get badge shape styles based on node shape
 */
function getBadgeShapeStyles(shape: string): React.CSSProperties {
  const baseSize = 18;

  switch (shape) {
    case 'circle':
      return {
        width: baseSize,
        height: baseSize,
        borderRadius: '50%',
      };
    case 'diamond':
      return {
        width: baseSize - 4,
        height: baseSize - 4,
        borderRadius: 0,
        transform: 'rotate(45deg)',
      };
    case 'hexagon':
      return {
        width: baseSize,
        height: baseSize,
        borderRadius: 0,
        clipPath: 'polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%)',
      };
    case 'rectangle':
    default:
      return {
        width: baseSize,
        height: baseSize,
        borderRadius: 0,
      };
  }
}

/**
 * Get badge position based on shape - diamonds need badges at their points, not bounding box corners
 */
function getBadgePosition(shape: string, position: BadgePosition): React.CSSProperties {
  const isDiamondShape = shape === 'diamond';

  if (isDiamondShape) {
    // Diamond points are at the middle of each edge of the bounding box
    switch (position) {
      case 'top-left':
      case 'left':
        return { top: '50%', left: 0, transform: 'translate(-50%, -50%)' };
      case 'top-right':
      case 'right':
        return { top: '50%', right: 0, transform: 'translate(50%, -50%)' };
      case 'top':
        return { top: 0, left: '50%', transform: 'translate(-50%, -50%)' };
      case 'bottom':
      case 'bottom-left':
      case 'bottom-right':
        return { bottom: 0, left: '50%', transform: 'translate(-50%, 50%)' };
    }
  }

  // Default positioning for rectangles, circles, hexagons (bounding box corners)
  switch (position) {
    case 'top-left':
      return { top: -6, left: -6 };
    case 'top-right':
      return { top: -6, right: -6 };
    case 'bottom-left':
      return { bottom: -6, left: -6 };
    case 'bottom-right':
      return { bottom: -6, right: -6 };
    case 'left':
      return { top: -6, left: -6 };
    case 'right':
      return { top: -6, right: -6 };
    case 'top':
      return { top: -6, left: '50%', transform: 'translateX(-50%)' };
    case 'bottom':
      return { bottom: -6, left: '50%', transform: 'translateX(-50%)' };
  }
}

interface BadgeProps {
  shape: string;
  position: BadgePosition;
  backgroundColor: string;
  label: string;
  title: string;
  opacity: number;
}

const Badge: React.FC<BadgeProps> = ({
  shape,
  position,
  backgroundColor,
  label,
  title,
  opacity,
}) => {
  const { theme } = useTheme();
  const shapeStyles = getBadgeShapeStyles(shape);
  const positionStyles = getBadgePosition(shape, position);

  return (
    <div
      style={{
        position: 'absolute',
        ...positionStyles,
        ...shapeStyles,
        // Override transform if shape has rotation but we already have a position transform
        ...(shape === 'diamond'
          ? { transform: `${positionStyles.transform} rotate(45deg)` }
          : {}),
        backgroundColor,
        color: 'white',
        fontSize: theme.fontSizes[0],
        fontWeight: theme.fontWeights.bold,
        fontFamily: theme.fonts.body,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
        zIndex: 10,
        opacity,
      }}
      title={title}
    >
      <span style={{ transform: shapeStyles.transform ? 'rotate(-45deg)' : undefined }}>
        {label}
      </span>
    </div>
  );
};

/**
 * Status badge component (top-left)
 */
const StatusBadge: React.FC<{
  shape: string;
  status: 'draft' | 'approved' | 'implemented';
  opacity: number;
}> = ({ shape, status, opacity }) => {
  const statusColors = {
    draft: '#6b7280', // Gray
    approved: '#3b82f6', // Blue
    implemented: '#10b981', // Green
  };

  const statusLabels = {
    draft: 'D',
    approved: 'A',
    implemented: 'I',
  };

  const statusTitles = {
    draft: 'Draft - Design phase',
    approved: 'Approved - Ready for implementation',
    implemented: 'Implemented - Code exists',
  };

  return (
    <Badge
      shape={shape}
      position="top-left"
      backgroundColor={statusColors[status]}
      label={statusLabels[status]}
      title={statusTitles[status]}
      opacity={opacity}
    />
  );
};

/**
 * Sources badge component (top-right)
 */
const SourcesBadge: React.FC<{
  shape: string;
  sourceFiles: string[];
  opacity: number;
}> = ({ shape, sourceFiles, opacity }) => {
  return (
    <Badge
      shape={shape}
      position="top-right"
      backgroundColor="#10b981" // Green
      label="S"
      title={`Source files: ${sourceFiles.join(', ')}`}
      opacity={opacity}
    />
  );
};

/**
 * References badge component (bottom-left)
 */
const ReferencesBadge: React.FC<{
  shape: string;
  references: string[];
  opacity: number;
}> = ({ shape, references, opacity }) => {
  return (
    <Badge
      shape={shape}
      position="bottom-left"
      backgroundColor="#8b5cf6" // Purple
      label="R"
      title={`References: ${references.join(', ')}`}
      opacity={opacity}
    />
  );
};

/**
 * Boundary badge component (right or left based on direction)
 */
const BoundaryBadge: React.FC<{
  boundary: BoundaryData;
  opacity: number;
}> = ({ boundary, opacity }) => {
  const { theme } = useTheme();
  const direction = boundary.direction || 'outbound';
  const isOutbound = direction === 'outbound';
  const directionIcon = isOutbound ? '↗' : '↙';
  const directionTitle = isOutbound
    ? 'Outbound boundary (calls external system)'
    : 'Inbound boundary (called by external system)';

  const positionStyles = getBadgePosition('rectangle', isOutbound ? 'right' : 'left');

  return (
    <div
      style={{
        position: 'absolute',
        ...positionStyles,
        width: 18,
        height: 18,
        borderRadius: '50%', // Always circular for boundary badge
        backgroundColor: '#06b6d4', // Cyan
        color: 'white',
        fontSize: 12,
        fontWeight: theme.fontWeights.bold,
        fontFamily: theme.fonts.body,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
        zIndex: 10,
        opacity,
      }}
      title={directionTitle}
    >
      {directionIcon}
    </div>
  );
};

/**
 * Node badges component - renders status, sources, references, and boundary badges
 */
export const NodeBadges: React.FC<NodeBadgesProps> = ({
  shape,
  status,
  sourceFiles,
  references,
  boundary,
  opacity = 1,
}) => {
  const isBoundaryNode = !!boundary;

  return (
    <>
      {status && <StatusBadge shape={shape} status={status} opacity={opacity} />}
      {isBoundaryNode ? (
        <BoundaryBadge boundary={boundary} opacity={opacity} />
      ) : (
        <>
          {sourceFiles && sourceFiles.length > 0 && (
            <SourcesBadge shape={shape} sourceFiles={sourceFiles} opacity={opacity} />
          )}
          {references && references.length > 0 && (
            <ReferencesBadge shape={shape} references={references} opacity={opacity} />
          )}
        </>
      )}
    </>
  );
};
