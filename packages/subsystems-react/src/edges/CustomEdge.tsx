import React, { useState, useEffect, useRef } from 'react';
import { BaseEdge, EdgeLabelRenderer, getSmoothStepPath } from '@xyflow/react';
import type { EdgeProps, Edge } from '@xyflow/react';
import type { EdgeTypeDefinition } from '@principal-ai/subsystems-core';
import { useTheme } from '@principal-ade/industry-theme';

export interface CustomEdgeData extends Record<string, unknown> {
  typeDefinition: EdgeTypeDefinition;
  hasViolations?: boolean;
  data?: Record<string, unknown>;
  edgeType?: string;
  // Animation control
  animationType?: 'flow' | 'particle' | 'pulse' | 'glow' | null;
  animationDuration?: number;
  animationDirection?: 'forward' | 'backward' | 'bidirectional';
  // Whether tooltips are enabled (defaults to true)
  tooltipsEnabled?: boolean;
  // Whether shift key is currently pressed (for tooltip control)
  shiftKeyPressed?: boolean;
  // ELK-computed path (circuit-board style routing)
  elkPath?: string;
  // ELK-computed label position
  elkLabelPosition?: { x: number; y: number };
}

/**
 * Custom edge component for xyflow that renders based on EdgeTypeDefinition
 */
export const CustomEdge: React.FC<EdgeProps<Edge<CustomEdgeData>>> = ({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  markerEnd,
  selected,
}) => {
  const { theme } = useTheme();
  const edgeProps = data;
  const {
    typeDefinition,
    hasViolations,
    data: edgeData,
    edgeType,
    animationType,
    animationDuration = 1000,
    animationDirection = 'forward',
    tooltipsEnabled = true,
    shiftKeyPressed = false,
    elkPath,
    elkLabelPosition,
  } = edgeProps || ({} as CustomEdgeData);

  const [particlePosition, setParticlePosition] = useState(0);
  const [isHovered, setIsHovered] = useState(false);
  const pathRef = useRef<SVGPathElement>(null);

  // Particle animation effect
  useEffect(() => {
    if (animationType !== 'particle') return;

    const animate = () => {
      setParticlePosition((prev) => {
        const next = prev + (100 / animationDuration) * 16; // ~60fps
        return next >= 100 ? 0 : next;
      });
    };

    const intervalId = setInterval(animate, 16);
    return () => clearInterval(intervalId);
  }, [animationType, animationDuration]);

  // Early return after hooks
  if (!typeDefinition) {
    return null;
  }

  // Color priority: violations > edge data color > type definition color > default
  const edgeColor = edgeData?.color as string | undefined;
  const color = hasViolations ? '#D0021B' : edgeColor || typeDefinition.color || '#888';
  const width = typeDefinition.width || 2;

  // Get edge path - use ELK path if available, otherwise fall back to SmoothStep
  const [defaultPath, defaultLabelX, defaultLabelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: 0,
    offset: 20,
  });

  // Use ELK-computed path for circuit-board style routing when available
  const edgePath = elkPath || defaultPath;
  const labelX = elkLabelPosition?.x ?? defaultLabelX;
  const labelY = elkLabelPosition?.y ?? defaultLabelY;

  // Style based on edge type
  const getStrokeStyle = () => {
    switch (typeDefinition.style) {
      case 'dashed':
        return '5 5';
      case 'dotted':
        return '2 2';
      default:
        return 'none';
    }
  };

  // Label configuration
  const labelConfig = typeDefinition.label;
  const labelField = labelConfig?.field;
  const labelText = labelField && edgeData?.[labelField] ? String(edgeData[labelField]) : '';

  // Animation-specific rendering helpers
  const getAnimationClass = () => {
    if (!animationType) {
      return typeDefinition.style === 'animated' ? 'edge-flow-forward' : '';
    }

    switch (animationType) {
      case 'flow':
        return animationDirection === 'backward'
          ? 'edge-flow-backward'
          : animationDirection === 'bidirectional'
          ? 'edge-flow-bidirectional'
          : 'edge-flow-forward';
      case 'pulse':
        return 'edge-pulse';
      case 'glow':
        return 'edge-glow';
      default:
        return '';
    }
  };

  const getAnimationDurationStyle = () => {
    if (!animationType) return {};
    return {
      animationDuration: `${animationDuration}ms`,
    };
  };

  // Calculate particle position along path using SVG path methods
  const getParticleTransform = () => {
    if (!pathRef.current) {
      // Fallback to linear interpolation if path ref not available yet
      const progress =
        animationDirection === 'backward' ? 1 - particlePosition / 100 : particlePosition / 100;
      const x = sourceX + (targetX - sourceX) * progress;
      const y = sourceY + (targetY - sourceY) * progress;
      return { x, y };
    }

    // Use actual path to get point along the curve
    const pathLength = pathRef.current.getTotalLength();
    const progress =
      animationDirection === 'backward' ? 1 - particlePosition / 100 : particlePosition / 100;
    const distance = pathLength * progress;
    const point = pathRef.current.getPointAtLength(distance);

    return { x: point.x, y: point.y };
  };

  const particlePos = animationType === 'particle' ? getParticleTransform() : null;

  return (
    <g
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{ cursor: 'pointer' }}
    >
      {/* Hidden path for particle position calculation */}
      <path
        ref={pathRef}
        d={edgePath}
        fill="none"
        stroke="transparent"
        strokeWidth={0}
        style={{ pointerEvents: 'none' }}
      />

      {/* Invisible wide path for easier clicking */}
      <path
        d={edgePath}
        fill="none"
        stroke="transparent"
        strokeWidth={Math.max(width + 10, 20)}
        style={{ pointerEvents: 'stroke' }}
      />

      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd as string}
        style={{
          stroke: color,
          strokeWidth: selected ? width + 2 : width,
          strokeDasharray: getStrokeStyle(),
          opacity: animationType ? 0.7 : 1,
          cursor: 'pointer',
        }}
      />

      {/* Flow Animation - Animated dashed overlay */}
      {animationType === 'flow' && (
        <path
          d={edgePath}
          fill="none"
          stroke={typeDefinition.animation?.color || color}
          strokeWidth={width}
          strokeDasharray="10 5"
          className={getAnimationClass()}
          style={{
            ...getAnimationDurationStyle(),
            opacity: 0.8,
          }}
        />
      )}

      {/* Pulse Animation - Wave effect */}
      {animationType === 'pulse' && (
        <path
          d={edgePath}
          fill="none"
          stroke={typeDefinition.animation?.color || color}
          strokeWidth={width + 2}
          className={getAnimationClass()}
          style={{
            ...getAnimationDurationStyle(),
          }}
        />
      )}

      {/* Glow Animation - Brief highlight */}
      {animationType === 'glow' && (
        <path
          d={edgePath}
          fill="none"
          stroke={typeDefinition.animation?.color || color}
          strokeWidth={width + 4}
          className={getAnimationClass()}
          style={{
            ...getAnimationDurationStyle(),
            filter: 'blur(3px)',
          }}
        />
      )}

      {/* Particle Animation - Traveling dot */}
      {animationType === 'particle' && particlePos && (
        <circle
          cx={particlePos.x}
          cy={particlePos.y}
          r={width * 1.5}
          fill={typeDefinition.animation?.color || color}
          style={{
            filter: 'drop-shadow(0 0 3px rgba(0,0,0,0.3))',
          }}
        />
      )}

      {/* Fallback: Legacy animated style support */}
      {!animationType && typeDefinition.style === 'animated' && (
        <path
          d={edgePath}
          fill="none"
          stroke={typeDefinition.animation?.color || color}
          strokeWidth={width}
          strokeDasharray="5 5"
          className="edge-flow-forward"
          style={{
            animationDuration: '500ms',
          }}
        />
      )}

      {/* Label */}
      {labelText && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              backgroundColor: 'white',
              padding: '2px 6px',
              borderRadius: '4px',
              fontSize: theme.fontSizes[0],
              fontWeight: theme.fontWeights.medium,
              fontFamily: theme.fonts.body,
              border: `1px solid ${color}`,
              pointerEvents: 'all',
              zIndex: 1000,
            }}
            className="nodrag nopan"
          >
            {labelText}
          </div>
        </EdgeLabelRenderer>
      )}

      {/* Hover tooltip showing edge type - only shown when shift key is pressed */}
      {tooltipsEnabled && isHovered && shiftKeyPressed && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -100%) translate(${labelX}px,${labelY - 12}px)`,
              backgroundColor: 'rgba(0, 0, 0, 0.85)',
              color: 'white',
              padding: '4px 8px',
              borderRadius: '4px',
              fontSize: theme.fontSizes[0],
              fontWeight: theme.fontWeights.medium,
              fontFamily: theme.fonts.body,
              whiteSpace: 'nowrap',
              pointerEvents: 'none',
              zIndex: 1000,
              boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
            }}
          >
            {edgeType || 'edge'}
          </div>
        </EdgeLabelRenderer>
      )}

      {/* CSS animations for all edge animation types */}
      <style>{`
        /* Flow animation - forward direction */
        .edge-flow-forward {
          animation: flow-forward linear infinite;
        }

        @keyframes flow-forward {
          to {
            stroke-dashoffset: -15;
          }
        }

        /* Flow animation - backward direction */
        .edge-flow-backward {
          animation: flow-backward linear infinite;
        }

        @keyframes flow-backward {
          to {
            stroke-dashoffset: 15;
          }
        }

        /* Flow animation - bidirectional (alternating) */
        .edge-flow-bidirectional {
          animation: flow-bidirectional linear infinite alternate;
        }

        @keyframes flow-bidirectional {
          0% {
            stroke-dashoffset: -15;
          }
          100% {
            stroke-dashoffset: 15;
          }
        }

        /* Pulse animation - wave effect */
        .edge-pulse {
          animation: pulse ease-in-out infinite;
        }

        @keyframes pulse {
          0%, 100% {
            opacity: 0.3;
            stroke-width: inherit;
          }
          50% {
            opacity: 1;
            stroke-width: calc(inherit + 2);
          }
        }

        /* Glow animation - brief highlight */
        .edge-glow {
          animation: glow ease-out forwards;
        }

        @keyframes glow {
          0% {
            opacity: 1;
          }
          100% {
            opacity: 0;
          }
        }
      `}</style>
    </g>
  );
};
