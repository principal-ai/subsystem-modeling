import { v } from 'convex/values';
import { mutation, query } from './_generated/server';

/** Live cursors / who is in the room. */
export const listPresence = query({
  args: { roomId: v.string() },
  handler: async (ctx, { roomId }) => {
    return ctx.db
      .query('presence')
      .withIndex('by_room', (q) => q.eq('roomId', roomId))
      .collect();
  },
});

export const updatePresence = mutation({
  args: {
    roomId: v.string(),
    userId: v.string(),
    x: v.number(),
    y: v.number(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query('presence')
      .withIndex('by_user', (q) =>
        q.eq('roomId', args.roomId).eq('userId', args.userId),
      )
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, { x: args.x, y: args.y, updatedAt: Date.now() });
      return existing._id;
    }
    return ctx.db.insert('presence', { ...args, updatedAt: Date.now() });
  },
});
