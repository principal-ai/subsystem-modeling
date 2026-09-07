import { writeFile } from 'node:fs/promises';
import { Command } from 'commander';
import {
  accumulateEvents,
  buildAgentSessionFixture,
  collectRepositories,
  fetchRawEvents,
  listAgentSessions,
  normalizeEvents,
  normalizeEventsWithAdapter,
} from '@principal-ai/subsystems-core/node';

export function createAgentSessionCommand(): Command {
  const command = new Command('agent-session')
    .description(
      'Read agent sessions and normalize them into universal events (Cline + Codex + opencode + pi + grok)',
    );

  command
    .command('list')
    .description(
      'List top-level sessions from all supported agents (Cline + Codex + opencode + pi + grok)',
    )
    .option('--db-path <path>', 'Path to opencode.db (defaults to XDG data dir)')
    .action((options: { dbPath?: string }) => {
      const sessions = listAgentSessions({ dbPath: options.dbPath });
      process.stdout.write(JSON.stringify(sessions, null, 2) + '\n');
    });

  command
    .command('fetch <session-id>')
    .description('Fetch a session and print its normalized universal events as JSON')
    .option(
      '--agent <cline|codex|opencode|pi|grok>',
      'Force agent detection (defaults to auto-detect)',
    )
    .option('--db-path <path>', 'Path to opencode.db (defaults to XDG data dir)')
    .option('--raw', 'Output raw universal events before repo normalization')
    .option(
      '--view <normalized|accumulated|both>',
      'Which pipeline stage to return (defaults to both)',
      'both',
    )
    .action(
      async (
        sessionId: string,
        options: {
          agent?: 'cline' | 'codex' | 'opencode' | 'pi' | 'grok';
          dbPath?: string;
          raw?: boolean;
          view?: 'normalized' | 'accumulated' | 'both';
        },
      ) => {
        const { agent, events } = fetchRawEvents(sessionId, {
          agent: options.agent,
          dbPath: options.dbPath,
        });
        if (options.raw) {
          process.stdout.write(JSON.stringify({ agent, events }, null, 2) + '\n');
          return;
        }
        const view = options.view ?? 'both';
        const normalized = await normalizeEvents(events);
        const accumulated = accumulateEvents(normalized);
        const repos = collectRepositories(normalized);
        const payload: Record<string, unknown> = { agent, sessionId, repos };
        if (view === 'normalized' || view === 'both') payload.normalized = normalized;
        if (view === 'accumulated' || view === 'both') payload.accumulated = accumulated;
        process.stdout.write(JSON.stringify(payload, null, 2) + '\n');
      },
    );

  command
    .command('fixture <session-id>')
    .description(
      'Generate a frozen File City agent-session fixture JSON (Cline + Codex + opencode + pi + grok)',
    )
    .option(
      '--agent <cline|codex|opencode|pi|grok>',
      'Force agent detection (defaults to auto-detect)',
    )
    .option('--db-path <path>', 'Path to opencode.db (defaults to XDG data dir)')
    .option('-o, --out <path>', 'Output file path (defaults to <session-id>.fixture.json)')
    .action(
      async (
        sessionId: string,
        options: {
          agent?: 'cline' | 'codex' | 'opencode' | 'pi' | 'grok';
          dbPath?: string;
          out?: string;
        },
      ) => {
        const { agent, events, sessionMeta } = fetchRawEvents(sessionId, {
          agent: options.agent,
          dbPath: options.dbPath,
        });
        const { normalized } = await normalizeEventsWithAdapter(
          events,
          sessionMeta.workingDirectory,
        );
        const fixture = buildAgentSessionFixture({
          agent,
          sessionId,
          sessionMeta,
          normalizedEvents: normalized,
          rawEventCount: events.length,
        });
        const outPath = options.out ?? `${sessionId}.fixture.json`;
        await writeFile(outPath, JSON.stringify(fixture, null, 2));
        process.stderr.write(`Wrote ${agent} fixture to ${outPath}\n`);
        process.stdout.write(JSON.stringify(fixture.session, null, 2) + '\n');
      },
    );

  return command;
}
