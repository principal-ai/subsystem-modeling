import { Command } from "commander"
import { OpenCodeEventStore } from "@principal-ai/subsystems-core/node"

export function createListSessionsCommand(): Command {
  const command = new Command("list-sessions")

  command
    .description("List session IDs in the opencode database")
    .option("--db-path <path>", "Path to opencode.db (defaults to XDG data dir)")
    .option("--limit <number>", "Maximum sessions to list", "50")
    .action((options: { dbPath?: string; limit?: string }) => {
      const store = new OpenCodeEventStore({ dbPath: options.dbPath })
      try {
        const ids = store.listSessionIds(options.limit ? Number(options.limit) : 50)
        process.stdout.write(JSON.stringify(ids, null, 2) + "\n")
      } finally {
        store.close()
      }
    })

  return command
}
