import { Command } from "commander"
import { OpenCodeEventStore } from "@principal-ai/subsystems-core/node"

export function createFetchCommand(): Command {
  const command = new Command("fetch")

  command
    .description("Fetch events for an opencode session and print as JSON")
    .argument("<session-id>", "The session ID (aggregate_id) to fetch events for")
    .option("-l, --limit <number>", "Maximum events to fetch", "10000")
    .option("-a, --after <number>", "Sequence number to start after", "-1")
    .option("--db-path <path>", "Path to opencode.db (defaults to XDG data dir)")
    .action((sessionId: string, options: { limit?: string; after?: string; dbPath?: string }) => {
      const store = new OpenCodeEventStore({ dbPath: options.dbPath })
      try {
        const result = store.readAggregate(sessionId, {
          after: options.after ? Number(options.after) : -1,
          limit: options.limit ? Number(options.limit) : 10000,
        })
        process.stdout.write(JSON.stringify(result, null, 2) + "\n")
      } finally {
        store.close()
      }
    })

  return command
}
