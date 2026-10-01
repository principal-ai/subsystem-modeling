import { afterEach, describe, expect, it } from 'bun:test';
import { createServer, type Server } from 'node:http';
import { handoffTopicToBridge } from './bridge-ipc.js';

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

const ACTIVATE = 'POST /api/topics/topic-123/activate';

describe('handoffTopicToBridge', () => {
  it('returns true when the app finds the topic and opens a window', async () => {
    await withBridge(
      {
        'GET /health': () => [200, { status: 'ok' }],
        [ACTIVATE]: () => [200, { success: true, windowOpened: 'focused' }],
      },
      async () => {
        expect(await handoffTopicToBridge('topic-123')).toBe(true);
      },
    );
  });

  it('returns true when no window opened but the payload was delivered', async () => {
    await withBridge(
      {
        'GET /health': () => [200, { status: 'ok' }],
        [ACTIVATE]: () => [200, { success: true, windowOpened: 'none', delivered: 2 }],
      },
      async () => {
        expect(await handoffTopicToBridge('topic-123')).toBe(true);
      },
    );
  });

  it('returns false when the app has no window to surface the topic', async () => {
    await withBridge(
      {
        'GET /health': () => [200, { status: 'ok' }],
        [ACTIVATE]: () => [200, { success: true, windowOpened: 'none', delivered: 0 }],
      },
      async () => {
        expect(await handoffTopicToBridge('topic-123')).toBe(false);
      },
    );
  });

  it('returns false when the app reports failure', async () => {
    await withBridge(
      {
        'GET /health': () => [200, { status: 'ok' }],
        [ACTIVATE]: () => [200, { success: false, windowOpened: 'focused' }],
      },
      async () => {
        expect(await handoffTopicToBridge('topic-123')).toBe(false);
      },
    );
  });

  it('returns false on a 404 (app running but topic not in its store)', async () => {
    await withBridge(
      {
        'GET /health': () => [200, { status: 'ok' }],
        [ACTIVATE]: () => [404, { success: false, error: 'unknown id' }],
      },
      async () => {
        expect(await handoffTopicToBridge('topic-123')).toBe(false);
      },
    );
  });

  it('url-encodes ids that would otherwise change the route', async () => {
    await withBridge(
      {
        'GET /health': () => [200, { status: 'ok' }],
        'POST /api/topics/topic%2Fa%20b/activate': () => [
          200,
          { success: true, windowOpened: 'focused' },
        ],
      },
      async () => {
        expect(await handoffTopicToBridge('topic/a b')).toBe(true);
      },
    );
  });

  it('returns false when no bridge is listening', async () => {
    // Point at a port nothing is bound to; the health probe should fail fast.
    process.env['PRINCIPAL_BRIDGE_PORT'] = '1';
    expect(await handoffTopicToBridge('topic-123')).toBe(false);
  });
});
