/**
 * Shared utilities for collector commands
 */

import crypto from 'node:crypto';

export const DEFAULT_COLLECTOR_PORT = 4318;
const DEFAULT_TIMEOUT_MS = 2000;

export interface HealthResponse {
  status: string;
  tracesReceived?: number;
  logsReceived?: number;
}

export interface ServiceStats {
  summary: {
    totalServices: number;
    aliveServices: number;
    totalTraces: number;
  };
  services: Record<string, ServiceInfo>;
}

export interface ServiceInfo {
  firstSeen: string;
  lastSeen: string;
  totalTraces: number;
  isAlive: boolean;
}

export interface OTLPTracePayload {
  resourceSpans: Array<{
    resource: {
      attributes: Array<{ key: string; value: { stringValue?: string; boolValue?: boolean } }>;
    };
    scopeSpans: Array<{
      scope: { name: string };
      spans: Array<{
        traceId: string;
        spanId: string;
        name: string;
        kind: number;
        startTimeUnixNano: string;
        endTimeUnixNano: string;
        attributes: Array<{ key: string; value: { stringValue?: string } }>;
        status: { code: number };
      }>;
    }>;
  }>;
}

/**
 * Check if the collector is healthy
 */
export async function checkHealth(port: number): Promise<HealthResponse | null> {
  try {
    const response = await fetch(`http://localhost:${port}/health`, {
      signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
    });

    if (!response.ok) {
      return null;
    }

    return (await response.json()) as HealthResponse;
  } catch {
    return null;
  }
}

/**
 * Get service statistics from the collector
 */
export async function getServiceStats(port: number): Promise<ServiceStats | null> {
  try {
    const response = await fetch(`http://localhost:${port}/services/stats`, {
      signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
    });

    if (!response.ok) {
      return null;
    }

    return (await response.json()) as ServiceStats;
  } catch {
    return null;
  }
}

/**
 * Create a minimal test trace payload
 */
export function createTestTrace(serviceName: string): OTLPTracePayload {
  const traceId = crypto.randomUUID().replace(/-/g, '');
  const spanId = crypto.randomUUID().replace(/-/g, '').slice(0, 16);
  const now = Date.now() * 1_000_000; // Convert to nanoseconds

  return {
    resourceSpans: [
      {
        resource: {
          attributes: [
            { key: 'service.name', value: { stringValue: serviceName } },
            { key: 'principal.cli.test', value: { boolValue: true } },
          ],
        },
        scopeSpans: [
          {
            scope: { name: 'principal-cli-check' },
            spans: [
              {
                traceId,
                spanId,
                name: 'cli.connectivity.test',
                kind: 1, // INTERNAL
                startTimeUnixNano: String(now),
                endTimeUnixNano: String(now + 1_000_000), // 1ms duration
                attributes: [
                  {
                    key: 'test.timestamp',
                    value: { stringValue: new Date().toISOString() },
                  },
                ],
                status: { code: 1 }, // OK
              },
            ],
          },
        ],
      },
    ],
  };
}

export interface SendTraceResult {
  success: boolean;
  statusCode?: number;
  latencyMs: number;
  error?: string;
}

/**
 * Send a test trace to the collector
 */
export async function sendTestTrace(
  port: number,
  trace: OTLPTracePayload,
  authToken?: string
): Promise<SendTraceResult> {
  const start = Date.now();

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (authToken) {
      headers['Authorization'] = `Bearer ${authToken}`;
    }

    const response = await fetch(`http://localhost:${port}/v1/traces`, {
      method: 'POST',
      headers,
      body: JSON.stringify(trace),
      signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
    });

    const latencyMs = Date.now() - start;

    return {
      success: response.ok,
      statusCode: response.status,
      latencyMs,
      error: response.ok ? undefined : `HTTP ${response.status}`,
    };
  } catch (error) {
    return {
      success: false,
      latencyMs: Date.now() - start,
      error: (error as Error).message,
    };
  }
}

/**
 * Format relative time (e.g., "30s ago", "2m ago")
 */
export function formatRelativeTime(isoString: string): string {
  const date = new Date(isoString);
  const now = Date.now();
  const diffMs = now - date.getTime();

  if (diffMs < 0) return 'just now';

  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 60) return `${seconds}s ago`;

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

/**
 * Check if a port is responding (basic connectivity check)
 */
export async function checkPort(port: number): Promise<{ open: boolean; service?: string }> {
  try {
    const response = await fetch(`http://localhost:${port}/health`, {
      signal: AbortSignal.timeout(1000),
    });

    if (response.ok) {
      return { open: true, service: 'collector' };
    }

    return { open: true, service: 'unknown' };
  } catch {
    return { open: false };
  }
}
