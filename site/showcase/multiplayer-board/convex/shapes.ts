import { v } from 'convex/values';
import { mutation, query } from './_generated/server';

/** Reactive list of shapes in a room — peers re-render when this changes. */
export const listShapes = query({
  args: { roomId: v.string() },
  handler: async (ctx, { roomId }) => {
    return ctx.db
      .query('shapes')
      .withIndex('by_room', (q) => q.eq('roomId', roomId))
      .collect();
  },
});

/** Upsert a stroke/shape — the write path for a local draw. */
export const upsertShape = mutation({
  args: {
    roomId: v.string(),
    shapeId: v.string(),
    kind: v.string(),
    points: v.array(v.object({ x: v.number(), y: v.number() })),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query('shapes')
      .withIndex('by_shape', (q) => q.eq('shapeId', args.shapeId))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, { kind: args.kind, points: args.points });
      return existing._id;
    }
    return ctx.db.insert('shapes', args);
  },
});
