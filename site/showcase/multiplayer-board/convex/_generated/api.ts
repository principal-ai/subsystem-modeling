/**
 * Showcase stubs so fixture imports typecheck in the browser bundle.
 * Real Convex apps generate these under convex/_generated/.
 */
export const api = {
  shapes: {
    listShapes: 'shapes:listShapes',
    upsertShape: 'shapes:upsertShape',
  },
  presence: {
    listPresence: 'presence:listPresence',
    updatePresence: 'presence:updatePresence',
  },
} as const;

export declare const query: any;
export declare const mutation: any;
