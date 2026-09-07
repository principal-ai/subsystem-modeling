import { afterEach, describe, expect, it } from 'bun:test';
import { createServer, type Server } from 'node:http';
import { handoffToBridge } from './bridge-ipc.js';

/**
 * Spin up a throwaway HTTP server standing in for the desktop app's MCP bridge,
 * point PRINCIPAL_BRIDGE_PORT at it, and return a teardown. `routes` maps a
 * "METHOD /path" key to a handler returning [status, jsonBody].
 */
async function withBridge(
  routes: Record<string, () => [number, unknown]>,
  run: () => Promise<void>,
): Promise<void> {
  const server: Server = createServer((req, res) => {
    const key = `${req.method} ${req.url}`;
    const route = routes[key];
    if (!route) {
      res.writeHead(404).end();
      return;
    }
    const [status, body] = route();
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(body));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  process.env['PRINCIPAL_BRIDGE_PORT'] = String(port);
  process.env['PRINCIPAL_BRIDGE_HOST'] = '127.0.0.1';
  try {
    await run();
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

afterEach(() => {
  delete process.env['PRINCIPAL_BRIDGE_PORT'];
  delete process.env['PRINCIPAL_BRIDGE_HOST'];
});

describe('handoffToBridge', () => {
  it('returns true when the app finds the trail and opens a window', async () => {
    await withBridge(
      {
        'GET /health': () => [200, { status: 'ok' }],
        'POST /api/file-city/trail/activate': () => [
          200,
          { success: true, windowOpened: 'focused', broadcastTo: 1 },
        ],
      },
      async () => {
        expect(await handoffToBridge('trail-123')).toBe(true);
      },
    );
  });

  it('returns true when no window opened but the payload was broadcast', async () => {
    await withBridge(
      {
        'GET /health': () => [200, { status: 'ok' }],
        'POST /api/file-city/trail/activate': () => [
          200,
          { success: true, windowOpened: 'none', broadcastTo: 2 },
        ],
      },
      async () => {
        expect(await handoffToBridge('trail-123')).toBe(true);
      },
    );
  });

  it('returns false when the app has no window to surface the trail', async () => {
    await withBridge(
      {
        'GET /health': () => [200, { status: 'ok' }],
        'POST /api/file-city/trail/activate': () => [
          200,
          { success: true, windowOpened: 'none', broadcastTo: 0 },
        ],
      },
      async () => {
        expect(await handoffToBridge('trail-123')).toBe(false);
      },
    );
  });

  it('returns false on a 404 (app running but trail not in its store)', async () => {
    await withBridge(
      {
        'GET /health': () => [200, { status: 'ok' }],
        'POST /api/file-city/trail/activate': () => [
          404,
          { success: false, error: 'unknown id' },
        ],
      },
      async () => {
        expect(await handoffToBridge('trail-missing')).toBe(false);
      },
    );
  });

  it('returns false when no bridge is listening', async () => {
    // Point at a port nothing is bound to; the health probe should fail fast.
    process.env['PRINCIPAL_BRIDGE_PORT'] = '1';
    expect(await handoffToBridge('trail-123')).toBe(false);
  });
});
