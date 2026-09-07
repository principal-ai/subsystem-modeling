import { createContext } from 'react';

/**
 * Context for providing a portal target for tooltips.
 * This allows tooltips to be rendered within the graph container
 * instead of document.body, so they hide properly when tabs switch.
 */
export const TooltipPortalContext = createContext<HTMLElement | null>(null);
