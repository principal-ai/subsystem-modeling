#!/usr/bin/env bun
/**
 * One-off migration: split legacy subsystem-model `description` values into a
 * short `description` plus extended `notes`.
 *
 * Before the description / notes split, `description` carried the whole
 * Markdown blurb. New models keep `description` at <= 200 characters and put
 * the rest in `notes`. This script moves an overlong legacy description into
 * `notes` (preserving it verbatim) and derives a short plain-text description
 * from its first meaningful paragraph.
 *
 *   bun scripts/migrate-subsystem-model-notes.ts           # dry run
 *   bun scripts/migrate-subsystem-model-notes.ts --write   # apply + backup
 *
 * `--root <dir>` targets a models directory other than
 * `~/.principal/subsystem-models`. `PRINCIPAL_SUBSYSTEM_MODELS_HOME` is
 * honored as a home override, matching Studio's store.
 *
 * Deliberately does not bump `updatedAt`: this is a schema migration, not an
 * author edit, so audit fingerprints and "changed since opened" stay put.
 */

import { promises as fs } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const DESCRIPTION_MAX = 200;

const args = process.argv.slice(2);
const write = args.includes("--write");
const rootIndex = args.indexOf("--root");
const explicitRoot =
  rootIndex >= 0 ? args[rootIndex + 1] : undefined;

function modelsRoot(): string {
  if (explicitRoot?.trim()) return explicitRoot.trim();
  const homeOverride = process.env["PRINCIPAL_SUBSYSTEM_MODELS_HOME"]?.trim();
  return join(homeOverride || homedir(), ".principal", "subsystem-models");
}

interface LegacyModel {
  id?: unknown;
  title?: unknown;
  description?: unknown;
  notes?: unknown;
  [key: string]: unknown;
}

interface IndexEntry {
  id?: unknown;
  description?: unknown;
  [key: string]: unknown;
}

interface IndexFile {
  version?: unknown;
  entries?: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Drop the light Markdown that a short blurb does not need. */
function stripInlineMarkdown(text: string): string {
  return text
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/~~([^~]+)~~/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Derive a short plain-text blurb from the first meaningful paragraph,
 * skipping Markdown headings and code fences. Falls back to a hard truncation
 * so every legacy description has somewhere short to land.
 */
export function deriveShortDescription(raw: string): string | undefined {
  const lines = raw.replace(/\r\n?/g, "\n").split("\n");
  const paragraph: string[] = [];
  let inFence = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (/^```/.test(trimmed)) {
      inFence = !inFence;
      if (paragraph.length > 0) break;
      continue;
    }
    if (inFence) continue;
    if (!trimmed) {
      if (paragraph.length > 0) break;
      continue;
    }
    if (/^#{1,6}\s/.test(trimmed)) {
      if (paragraph.length > 0) break;
      continue;
    }
    if (/^(?:---+|\*\*\*+|___+)$/.test(trimmed)) continue;
    paragraph.push(
      trimmed
        .replace(/^>\s?/, "")
        .replace(/^(?:[-*+]|\d+[.)])\s+/, ""),
    );
  }

  let text = stripInlineMarkdown(paragraph.join(" "));
  if (!text) text = stripInlineMarkdown(raw);
  if (!text) return undefined;
  if (text.length <= DESCRIPTION_MAX) return text;

  const slice = text.slice(0, DESCRIPTION_MAX);
  // Prefer a sentence boundary if one lands late enough to be useful.
  const sentenceEnd = Math.max(
    slice.lastIndexOf(". "),
    slice.lastIndexOf("! "),
    slice.lastIndexOf("? "),
  );
  if (sentenceEnd >= 80) return slice.slice(0, sentenceEnd + 1).trim();

  const wordEnd = slice.lastIndexOf(" ");
  const cut = wordEnd > 0 ? wordEnd : DESCRIPTION_MAX - 1;
  return `${slice.slice(0, cut).trimEnd()}…`;
}

function nonEmpty(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

async function main(): Promise<void> {
  const root = modelsRoot();
  let files: string[];
  try {
    files = await fs.readdir(root);
  } catch {
    console.error(`No subsystem-models directory at ${root}`);
    process.exit(2);
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupDir = join(root, `.notes-migration-backup-${stamp}`);
  const modified: Array<{
    id: string;
    fileName: string;
    description?: string;
    original: LegacyModel;
  }> = [];
  let scanned = 0;

  for (const fileName of files) {
    if (!fileName.endsWith(".json") || fileName === "_index.json") continue;
    const path = join(root, fileName);
    let parsed: unknown;
    try {
      parsed = JSON.parse(await fs.readFile(path, "utf8"));
    } catch {
      console.warn(`skip ${fileName}: not readable JSON`);
      continue;
    }
    if (!isRecord(parsed)) continue;
    scanned += 1;
    const record = parsed as LegacyModel;
    const description = nonEmpty(record.description);
    // Already short (or absent): nothing to split.
    if (!description || description.length <= DESCRIPTION_MAX) continue;

    modified.push({
      id: typeof record.id === "string" ? record.id : fileName.replace(/\.json$/, ""),
      fileName,
      description: deriveShortDescription(description),
      original: parsed as LegacyModel,
    });
  }

  console.log(
    `${write ? "Migrating" : "Would migrate"} ${modified.length} of ${scanned} model(s) under ${root}`,
  );
  for (const item of modified) {
    const before = nonEmpty(item.original.description) ?? "";
    console.log(
      `  ${item.id}  ${before.length} chars -> ${item.description ? `"${item.description.slice(0, 80)}${item.description.length > 80 ? "…" : ""}"` : "(none)"} + notes`,
    );
  }

  if (!write || modified.length === 0) {
    if (!write && modified.length > 0) {
      console.log("\nDry run. Re-run with --write to back up and apply.");
    }
    return;
  }

  await fs.mkdir(backupDir, { recursive: true });
  for (const item of modified) {
    await fs.copyFile(
      join(root, item.fileName),
      join(backupDir, item.fileName),
    );
  }

  // Re-read and rewrite: the scan above kept only the decision, so the file on
  // disk is still the original byte-for-byte until this loop.
  for (const item of modified) {
    const path = join(root, item.fileName);
    const record = JSON.parse(await fs.readFile(path, "utf8")) as LegacyModel;
    const description = nonEmpty(record.description);
    if (description && description.length > DESCRIPTION_MAX) {
      const existingNotes = nonEmpty(record.notes);
      record.notes = existingNotes
        ? `${description}\n\n${existingNotes}`
        : description;
      const short = deriveShortDescription(description);
      if (short) record.description = short;
      else delete record.description;
      item.description = short;
      await fs.writeFile(path, `${JSON.stringify(record, null, 2)}\n`, "utf8");
    }
  }

  // Update the lightweight index in place; notes stay out of it.
  const indexPath = join(root, "_index.json");
  try {
    const index = JSON.parse(await fs.readFile(indexPath, "utf8")) as IndexFile;
    if (isRecord(index) && Array.isArray(index.entries)) {
      const byId = new Map(
        modified.map((item) => [item.id, item] as const),
      );
      for (const rawEntry of index.entries) {
        if (!isRecord(rawEntry)) continue;
        const entry = rawEntry as IndexEntry;
        const item = typeof entry.id === "string" ? byId.get(entry.id) : undefined;
        if (!item) continue;
        if (item.description) entry.description = item.description;
        else delete entry.description;
      }
      await fs.writeFile(indexPath, `${JSON.stringify(index, null, 2)}\n`, "utf8");
    }
  } catch {
    console.warn("index not updated (missing or unreadable); Studio rebuilds it on next list");
  }

  console.log(`\nBacked up originals to ${backupDir}`);
}

if (import.meta.main) {
  await main();
}
