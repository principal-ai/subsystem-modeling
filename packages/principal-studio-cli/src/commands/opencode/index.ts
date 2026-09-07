import { Command } from "commander"
import { createFetchCommand } from "./fetch.js"
import { createListSessionsCommand } from "./list-sessions.js"

export function createOpencodeCommand(): Command {
  const command = new Command("opencode")

  command
    .description("Read events from opencode's local SQLite database")
    .addCommand(createListSessionsCommand())
    .addCommand(createFetchCommand())

  return command
}
