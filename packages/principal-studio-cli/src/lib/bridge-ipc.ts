/**
 * Client-side helper for handing a local trail off to a running Principal
 * desktop app (electron-app) over its MCP bridge HTTP surface.
 *
 * Preferred over the Unix-socket handoff (viewer-ipc.ts) when the desktop app
 * is running: the bridge's `POST /api/file-city/trail/activate` route reads the
 * same on-disk trail store the app persists to, so a *local* trail id resolves
 * and opens in the app without a network fetch or GitHub token. Returns false
 * (caller falls back to the standalone viewer) when the app isn't running, the
 * probe times out, or the app doesn't have that trail.
 *
 * Duplicated rather than shared because cli and electron-app are independent
 * packages in separate repos — the HTTP route is the contract, this module
 * speaks it from the producer side.
 */

// Default port the electron-app's PrincipalMCPBridge binds. Overridable for dev
// builds / tests via PRINCIPAL_BRIDGE_PORT.
function bridgePort(): number {
  const raw = process.env['PRINCIPAL_BRIDGE_PORT'];
  const parsed = raw ? Number.parseInt(raw, 10) : NaN;
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 3044;
}

// Candidate hosts, in order. The app binds loopback but may be IPv6-only
// (`::1`) or IPv4-only (`127.0.0.1`) depending on the OS, and `localhost`
// resolution order varies by machine — so we probe each rather than trusting a
// single spelling. PRINCIPAL_BRIDGE_HOST pins one explicitly when needed.
function bridgeHosts(): string[] {
  const override = process.env['PRINCIPAL_BRIDGE_HOST'];
  if (override) return [override];
  return ['localhost', '127.0.0.1', '[::1]'];
}

function bridgeBases(): string[] {
  const port = bridgePort();
  return bridgeHosts().map((host) => `http://${host}:${port}`);
}

// Kept short: when the app isn't running we want to fall through to the
// socket/spawn path fast.
const PROBE_TIMEOUT_MS = 300;
// The activate call opens/focuses a window; allow a little more headroom.
const ACTIVATE_TIMEOUT_MS = 2_000;

interface ActivateResponse {
  success?: boolean;
  windowOpened?: string;
  broadcastTo?: number;
}

/**
 * Probe the candidate bases and return the first that answers /health, so the
 * follow-up activate call reuses the exact host that worked. Returns null when
 * none respond (app not running).
 */
async function reachableBase(): Promise<string | null> {
  for (const base of bridgeBases()) {
    try {
      const res = await fetch(`${base}/health`, {
        signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
      });
      if (res.ok) return base;
    } catch {
      // try the next host
    }
  }
  return null;
}

/**
 * Ask a running desktop app to open `trailId` from its local store. Returns
 * true only when the app actually surfaced the trail — i.e. it found the id AND
 * opened/focused a window (or broadcast the payload to an open one). A 404 (app
 * running but trail not in its store) or a no-window result returns false so the
 * caller can fall back to the standalone viewer.
 */
export async function handoffToBridge(trailId: string): Promise<boolean> {
  const base = await reachableBase();
  if (!base) return false;

  let res: Response;
  try {
    res = await fetch(`${base}/api/file-city/trail/activate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: trailId }),
      signal: AbortSignal.timeout(ACTIVATE_TIMEOUT_MS),
    });
  } catch {
    return false;
  }
  if (!res.ok) return false;

  let data: ActivateResponse;
  try {
    data = (await res.json()) as ActivateResponse;
  } catch {
    return false;
  }

  const surfaced =
    (data.windowOpened !== undefined && data.windowOpened !== 'none') ||
    (typeof data.broadcastTo === 'number' && data.broadcastTo > 0);
  return data.success === true && surfaced;
}

/**
 * Ask a running desktop app to open `topicId` from its local store. Mirrors
 * `handoffToBridge` but targets the topic activate route.
 */
export async function handoffTopicToBridge(topicId: string): Promise<boolean> {
  const base = await reachableBase();
  if (!base) return false;

  let res: Response;
  try {
    res = await fetch(`${base}/api/topics/${encodeURIComponent(topicId)}/activate`, {
      method: 'POST',
      signal: AbortSignal.timeout(ACTIVATE_TIMEOUT_MS),
    });
  } catch {
    return false;
  }
  if (!res.ok) return false;

  let data: { success?: boolean; windowOpened?: string; delivered?: number };
  try {
    data = (await res.json()) as { success?: boolean; windowOpened?: string; delivered?: number };
  } catch {
    return false;
  }

  const surfaced =
    (data.windowOpened !== undefined && data.windowOpened !== 'none') ||
    (typeof data.delivered === 'number' && data.delivered > 0);
  return data.success === true && surfaced;
}
