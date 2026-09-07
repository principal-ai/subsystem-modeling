import React, { createContext, useContext } from 'react';

export interface GraphEditContextValue {
  /** Called when a node resize operation completes */
  onNodeResizeEnd?: (nodeId: string, dimensions: { width: number; height: number }) => void;
  /** Called when node text is edited (for text and group nodes) */
  onNodeTextChange?: (nodeId: string, text: string) => void;
  /** Called to toggle node hidden state (Cmd/Ctrl+click) */
  onToggleNodeHidden?: (nodeId: string) => void;
  /** Called to hide all nodes not directly connected to the given node (Cmd/Ctrl+Shift+click) */
  onHideUnconnectedNodes?: (nodeId: string) => void;
}

const GraphEditContext = createContext<GraphEditContextValue>({});

export const GraphEditProvider: React.FC<{
  children: React.ReactNode;
  value: GraphEditContextValue;
}> = ({ children, value }) => {
  return (
    <GraphEditContext.Provider value={value}>
      {children}
    </GraphEditContext.Provider>
  );
};

export const useGraphEdit = () => useContext(GraphEditContext);
