import React, { useState } from 'react';
import type { NodeState, NodeTypeDefinition } from '@principal-ai/subsystems-core';
import { useTheme } from '@principal-ade/industry-theme';
import { resolveIcon } from '../utils/iconResolver';

export interface SelectionSidebarProps {
  /** Set of selected node IDs */
  selectedNodeIds: Set<string>;
  /** All nodes in the graph */
  nodes: NodeState[];
  /** Node type definitions for icons and colors */
  nodeTypeDefinitions: Record<string, NodeTypeDefinition>;
  /** Callback when sidebar is closed */
  onClose: () => void;
}

interface ExpandedState {
  [nodeId: string]: boolean;
}

/**
 * Sidebar that displays information about multiple selected nodes
 * Shows name and description for each node, with expandable details
 */
export const SelectionSidebar: React.FC<SelectionSidebarProps> = ({
  selectedNodeIds,
  nodes,
  nodeTypeDefinitions,
  onClose,
}) => {
  const { theme } = useTheme();
  const [expandedNodes, setExpandedNodes] = useState<ExpandedState>({});

  // Get the selected nodes in order
  const selectedNodes = nodes.filter((n) => selectedNodeIds.has(n.id));

  const toggleExpanded = (nodeId: string) => {
    setExpandedNodes((prev) => ({
      ...prev,
      [nodeId]: !prev[nodeId],
    }));
  };

  // Internal fields that should not be displayed
  const internalFields = [
    'icon',
    'name',
    'description',
    'sources',
    'color',
    'stroke',
    'width',
    'height',
    'canvasType',
    'text',
    'file',
    'url',
    'shape',
    'states',
    'actions',
    'nodeType',
  ];

  return (
    <div
      style={{
        position: 'absolute',
        top: '60px',
        right: '20px',
        backgroundColor: theme.colors.background,
        color: theme.colors.text,
        borderRadius: '8px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        padding: '16px',
        minWidth: '280px',
        maxWidth: '350px',
        maxHeight: 'calc(100vh - 120px)',
        overflowY: 'auto',
        zIndex: 1000,
        border: `1px solid ${theme.colors.border}`,
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '12px',
          paddingBottom: '8px',
          borderBottom: `2px solid ${theme.colors.primary}`,
        }}
      >
        <div style={{ fontWeight: theme.fontWeights.bold, fontSize: theme.fontSizes[1], fontFamily: theme.fonts.body, color: theme.colors.primary }}>
          {selectedNodes.length} nodes selected
        </div>
        <button
          onClick={onClose}
          style={{
            border: 'none',
            background: 'none',
            cursor: 'pointer',
            fontSize: theme.fontSizes[3],
            fontFamily: theme.fonts.body,
            color: theme.colors.textSecondary,
            padding: '0',
            width: '24px',
            height: '24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          x
        </button>
      </div>

      {/* Node List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {selectedNodes.map((node) => {
          const typeDefinition = nodeTypeDefinitions[node.type];
          const nodeColor =
            (node.data?.color as string) || typeDefinition?.color || theme.colors.secondary;
          const icon = (node.data?.icon as string) || typeDefinition?.icon;
          const isExpanded = expandedNodes[node.id] || false;
          const description = node.data?.description as string | undefined;

          // Get displayable data entries
          const dataEntries = node.data
            ? Object.entries(node.data).filter(([key]) => !internalFields.includes(key))
            : [];

          return (
            <div
              key={node.id}
              style={{
                backgroundColor: theme.colors.surface,
                borderRadius: '6px',
                border: `1px solid ${theme.colors.border}`,
                overflow: 'hidden',
              }}
            >
              {/* Node Header - Always visible */}
              <button
                onClick={() => toggleExpanded(node.id)}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  backgroundColor: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '10px',
                  textAlign: 'left',
                }}
              >
                {/* Icon */}
                <div
                  style={{
                    width: '28px',
                    height: '28px',
                    borderRadius: '6px',
                    backgroundColor: nodeColor,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    color: 'white',
                  }}
                >
                  {icon ? resolveIcon(icon, 16) : null}
                </div>

                {/* Name and Description */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontWeight: theme.fontWeights.semibold,
                      fontSize: theme.fontSizes[1],
                      fontFamily: theme.fonts.body,
                      color: theme.colors.text,
                      marginBottom: description ? '2px' : 0,
                    }}
                  >
                    {node.name || node.id}
                  </div>
                  {description && (
                    <div
                      style={{
                        fontSize: theme.fontSizes[0],
                        fontFamily: theme.fonts.body,
                        color: theme.colors.textSecondary,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        display: '-webkit-box',
                        WebkitLineClamp: isExpanded ? 'unset' : 2,
                        WebkitBoxOrient: 'vertical',
                      }}
                    >
                      {description}
                    </div>
                  )}
                </div>

                {/* Expand/Collapse Indicator */}
                <div
                  style={{
                    color: theme.colors.textSecondary,
                    fontSize: '10px',
                    transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                    transition: 'transform 0.2s',
                    flexShrink: 0,
                  }}
                >
                  ▼
                </div>
              </button>

              {/* Expanded Details */}
              {isExpanded && (
                <div
                  style={{
                    padding: '0 12px 10px 12px',
                    borderTop: `1px solid ${theme.colors.border}`,
                    marginTop: '0',
                  }}
                >
                  {/* Node Type */}
                  <div style={{ marginTop: '10px' }}>
                    <div
                      style={{
                        fontSize: theme.fontSizes[0],
                      fontFamily: theme.fonts.body,
                        color: theme.colors.textSecondary,
                        marginBottom: '4px',
                      }}
                    >
                      Type
                    </div>
                    <div
                      style={{
                        fontSize: theme.fontSizes[0],
                        fontFamily: theme.fonts.body,
                        padding: '3px 8px',
                        backgroundColor: nodeColor,
                        color: 'white',
                        borderRadius: '4px',
                        display: 'inline-block',
                      }}
                    >
                      {node.type}
                    </div>
                  </div>

                  {/* Node State */}
                  {node.state && (
                    <div style={{ marginTop: '8px' }}>
                      <div
                        style={{
                          fontSize: theme.fontSizes[0],
                      fontFamily: theme.fonts.body,
                          color: theme.colors.textSecondary,
                          marginBottom: '4px',
                        }}
                      >
                        State
                      </div>
                      <div
                        style={{
                          fontSize: theme.fontSizes[0],
                        fontFamily: theme.fonts.body,
                          padding: '3px 8px',
                          backgroundColor:
                            typeDefinition?.states?.[node.state]?.color || theme.colors.secondary,
                          color: 'white',
                          borderRadius: '4px',
                          display: 'inline-block',
                        }}
                      >
                        {typeDefinition?.states?.[node.state]?.label || node.state}
                      </div>
                    </div>
                  )}

                  {/* Data Properties */}
                  {dataEntries.length > 0 && (
                    <div style={{ marginTop: '8px' }}>
                      <div
                        style={{
                          fontSize: theme.fontSizes[0],
                      fontFamily: theme.fonts.body,
                          color: theme.colors.textSecondary,
                          marginBottom: '6px',
                          fontWeight: 'bold',
                        }}
                      >
                        Properties
                      </div>
                      {dataEntries.map(([key, value]) => (
                        <div key={key} style={{ marginBottom: '6px' }}>
                          <div
                            style={{
                              fontSize: theme.fontSizes[0],
                      fontFamily: theme.fonts.body,
                              color: theme.colors.textSecondary,
                              marginBottom: '2px',
                            }}
                          >
                            {key}
                          </div>
                          <div
                            style={{
                              fontSize: theme.fontSizes[0],
                        fontFamily: theme.fonts.body,
                              color: theme.colors.text,
                              wordBreak: 'break-word',
                            }}
                          >
                            {value !== undefined && value !== null
                              ? typeof value === 'object'
                                ? JSON.stringify(value, null, 2)
                                : String(value)
                              : '-'}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Node ID */}
                  <div
                    style={{
                      fontSize: theme.fontSizes[0],
                      fontFamily: theme.fonts.body,
                      color: theme.colors.textMuted,
                      marginTop: '8px',
                      paddingTop: '6px',
                      borderTop: `1px solid ${theme.colors.border}`,
                    }}
                  >
                    ID: {node.id}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
