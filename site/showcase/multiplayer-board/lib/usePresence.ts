'use client';

/**
 * Subscribe to peer cursors and publish local pointer position.
 */
import { useEffect } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../convex/_generated/api';

export function usePresence(roomId: string, userId = 'local') {
  const peers = useQuery(api.presence.listPresence, { roomId }) ?? [];
  const updatePresence = useMutation(api.presence.updatePresence);

  useEffect(() => {
    function onMove(e: PointerEvent) {
      void updatePresence({ roomId, userId, x: e.clientX, y: e.clientY });
    }
    window.addEventListener('pointermove', onMove);
    return () => window.removeEventListener('pointermove', onMove);
  }, [roomId, userId, updatePresence]);

  return { peers };
}
