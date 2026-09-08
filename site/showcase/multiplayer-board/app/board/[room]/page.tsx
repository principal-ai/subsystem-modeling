'use client';

/**
 * Multiplayer whiteboard room — Excalidraw-style canvas backed by Convex.
 * Local strokes upsert shapes; peers see them via a reactive query.
 */
import { useMutation, useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { usePresence } from '../../lib/usePresence';

export default function BoardPage({ roomId }: { roomId: string }) {
  const shapes = useQuery(api.shapes.listShapes, { roomId }) ?? [];
  const upsertShape = useMutation(api.shapes.upsertShape);
  const { peers } = usePresence(roomId);

  async function onStroke(points: Array<{ x: number; y: number }>) {
    await upsertShape({
      roomId,
      shapeId: crypto.randomUUID(),
      kind: 'path',
      points,
    });
  }

  return (
    <main>
      <div data-peers={peers.length} />
      <canvas
        onPointerUp={(e) => {
          void onStroke([{ x: e.clientX, y: e.clientY }]);
        }}
      />
      <ul>
        {shapes.map((s) => (
          <li key={s.shapeId}>{s.kind}</li>
        ))}
      </ul>
    </main>
  );
}
