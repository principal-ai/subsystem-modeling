/**
 * trace inspect - Show detailed trace information
 */

import { Command } from 'commander';
import chalk from 'chalk';

interface InspectOptions {
  port?: string;
  json?: boolean;
  events?: boolean;
  attributes?: boolean;
}

interface StoredTrace {
  traceId: string;
  data: {
    resourceSpans?: Array<{
      resource?: {
        attributes?: Array<{ key: string; value: unknown }>;
      };
      scopeSpans?: Array<{
        scope?: { name: string; version?: string };
        spans?: Array<{
          traceId: string;
          spanId: string;
          parentSpanId?: string;
          name: string;
          kind: number;
          startTimeUnixNano: string;
          endTimeUnixNano: string;
          attributes?: Array<{ key: string; value: unknown }>;
          events?: Array<{
            timeUnixNano: string;
            name: string;
            attributes?: Array<{ key: string; value: unknown }>;
          }>;
          status?: { code: number; message?: string };
        }>;
      }>;
    }>;
  };
}

const DEFAULT_APP_PORT = 3043;

const SPAN_KINDS: Record<number, string> = {
  0: 'UNSPECIFIED',
  1: 'INTERNAL',
  2: 'SERVER',
  3: 'CLIENT',
  4: 'PRODUCER',
  5: 'CONSUMER',
};

const STATUS_CODES: Record<number, string> = {
  0: 'UNSET',
  1: 'OK',
  2: 'ERROR',
};

export function createInspectCommand(): Command {
  const command = new Command('inspect');

  command
    .description('Show detailed information about a specific trace')
    .argument('<traceId>', 'Trace ID to inspect')
    .option('-p, --port <port>', 'Electron-app port (default: 3043, dev: 3045)')
    .option('--json', 'Output as JSON')
    .option('-e, --events', 'Show all events')
    .option('-a, --attributes', 'Show all attributes')
    .action(async (traceId: string, options: InspectOptions) => {
      try {
        const appPort = options.port ? parseInt(options.port, 10) : DEFAULT_APP_PORT;

        // Fetch the specific trace
        const trace = await fetchTrace(appPort, traceId);

        if (options.json) {
          console.log(JSON.stringify(trace, null, 2));
        } else {
          outputText(trace, options);
        }
      } catch (error) {
        console.error(chalk.red('Error:'), (error as Error).message);
        process.exit(1);
      }
    });

  return command;
}

async function fetchTrace(port: number, traceId: string): Promise<StoredTrace> {
  const url = `http://localhost:${port}/otel/traces/${traceId}`;

  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(5000) });

    if (!response.ok) {
      throw new Error(`Failed to fetch trace: ${response.statusText}`);
    }

    const data = (await response.json()) as { success: boolean; trace?: StoredTrace; error?: string };

    if (!data.success || !data.trace) {
      throw new Error(data.error || 'Trace not found');
    }

    return data.trace;
  } catch (error) {
    if ((error as Error).name === 'AbortError') {
      throw new Error('Request timeout - electron-app not responding');
    }
    throw error;
  }
}

function outputText(trace: StoredTrace, options: InspectOptions): void {
  console.log(chalk.bold('\nTrace Inspection'));
  console.log('━'.repeat(60));
  console.log(chalk.gray('Trace ID:'), chalk.cyan(trace.traceId));

  const resourceSpans = trace.data.resourceSpans ?? [];

  for (const rs of resourceSpans) {
    // Resource info
    const resourceAttrs = rs.resource?.attributes ?? [];
    const serviceName = getAttrValue(resourceAttrs, 'service.name') ?? 'unknown';
    const serviceVersion = getAttrValue(resourceAttrs, 'service.version');

    console.log();
    console.log(chalk.bold('Resource:'), chalk.yellow(serviceName));
    if (serviceVersion) {
      console.log(chalk.gray('  Version:'), serviceVersion);
    }

    if (options.attributes) {
      console.log(chalk.gray('  Attributes:'));
      for (const attr of resourceAttrs) {
        console.log(chalk.gray(`    ${attr.key}:`), formatAttrValue(attr.value));
      }
    }

    // Scope spans
    const scopeSpans = rs.scopeSpans ?? [];
    for (const ss of scopeSpans) {
      const scopeName = ss.scope?.name ?? 'unknown';
      const scopeVersion = ss.scope?.version;

      console.log();
      console.log(chalk.bold('  Scope:'), chalk.magenta(scopeName));
      if (scopeVersion) {
        console.log(chalk.gray('    Version:'), scopeVersion);
      }

      // Spans
      const spans = ss.spans ?? [];
      for (const span of spans) {
        const duration = calculateDuration(span.startTimeUnixNano, span.endTimeUnixNano);
        const kind = SPAN_KINDS[span.kind] ?? 'UNKNOWN';
        const status = STATUS_CODES[span.status?.code ?? 0] ?? 'UNKNOWN';
        const statusColor = span.status?.code === 2 ? chalk.red : span.status?.code === 1 ? chalk.green : chalk.gray;

        console.log();
        console.log(chalk.bold('    Span:'), chalk.blue(span.name));
        console.log(chalk.gray('      Span ID:'), span.spanId);
        if (span.parentSpanId) {
          console.log(chalk.gray('      Parent:'), span.parentSpanId);
        }
        console.log(chalk.gray('      Kind:'), kind);
        console.log(chalk.gray('      Status:'), statusColor(status));
        console.log(chalk.gray('      Duration:'), formatDuration(duration));
        console.log(chalk.gray('      Start:'), formatTimestamp(span.startTimeUnixNano));

        // Span attributes
        const spanAttrs = span.attributes ?? [];
        if (spanAttrs.length > 0 && options.attributes) {
          console.log(chalk.gray('      Attributes:'));
          for (const attr of spanAttrs) {
            console.log(chalk.gray(`        ${attr.key}:`), formatAttrValue(attr.value));
          }
        }

        // Events
        const events = span.events ?? [];
        if (events.length > 0) {
          console.log(chalk.gray(`      Events (${events.length}):`));

          const displayEvents = options.events ? events : events.slice(0, 5);
          for (const event of displayEvents) {
            const eventTime = formatTimestamp(event.timeUnixNano);
            console.log(chalk.green(`        • ${event.name}`) + chalk.gray(` @ ${eventTime}`));

            if (options.attributes && event.attributes) {
              for (const attr of event.attributes) {
                console.log(chalk.gray(`            ${attr.key}:`), formatAttrValue(attr.value));
              }
            }
          }

          if (!options.events && events.length > 5) {
            console.log(chalk.gray(`        ... and ${events.length - 5} more (use --events to see all)`));
          }
        }
      }
    }
  }

  console.log('\n' + '━'.repeat(60));
  console.log();
}

function getAttrValue(attrs: Array<{ key: string; value: unknown }>, key: string): string | undefined {
  const attr = attrs.find((a) => a.key === key);
  if (!attr) return undefined;

  const value = attr.value as { stringValue?: string; intValue?: number; boolValue?: boolean };
  return value.stringValue ?? value.intValue?.toString() ?? value.boolValue?.toString();
}

function formatAttrValue(value: unknown): string {
  if (typeof value === 'object' && value !== null) {
    const v = value as {
      stringValue?: string;
      intValue?: number;
      boolValue?: boolean;
      arrayValue?: { values: unknown[] };
    };
    if (v.stringValue !== undefined) return `"${v.stringValue}"`;
    if (v.intValue !== undefined) return String(v.intValue);
    if (v.boolValue !== undefined) return String(v.boolValue);
    if (v.arrayValue) return JSON.stringify(v.arrayValue.values);
    return JSON.stringify(value);
  }
  return String(value);
}

function calculateDuration(startNano: string, endNano: string): number {
  const start = BigInt(startNano);
  const end = BigInt(endNano);
  return Number((end - start) / BigInt(1_000_000)); // Convert to ms
}

function formatDuration(ms: number): string {
  if (ms < 1) {
    return `${(ms * 1000).toFixed(0)}µs`;
  }
  if (ms < 1000) {
    return `${ms.toFixed(2)}ms`;
  }
  return `${(ms / 1000).toFixed(2)}s`;
}

function formatTimestamp(nanoStr: string): string {
  const ms = Number(BigInt(nanoStr) / BigInt(1_000_000));
  return new Date(ms).toISOString();
}
