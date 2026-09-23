/**
 * Source-language inference for a component's declaration.
 *
 * The declaration panel is language-agnostic in shape (it renders a normalized
 * construct), but formatting + highlighting are language-specific: Prettier
 * only ships JS/TS/CSS/HTML/etc. parsers, and Shiki needs a grammar id. Infer
 * the language from the component's `file` extension so non-JS/TS sources are
 * not forced through the TypeScript parser.
 */

import { isPierreCFamilyPath } from './pierreFileLang';

/** A Shiki language id (e.g. `typescript`, `python`) or `text` when unknown. */
export type SourceSyntaxLang = string;

const EXT_TO_LANG: Record<string, SourceSyntaxLang> = {
  ts: 'typescript',
  mts: 'typescript',
  cts: 'typescript',
  tsx: 'tsx',
  js: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  jsx: 'jsx',
  py: 'python',
  pyi: 'python',
  rb: 'ruby',
  rs: 'rust',
  go: 'go',
  java: 'java',
  kt: 'kotlin',
  kts: 'kotlin',
  swift: 'swift',
  scala: 'scala',
  php: 'php',
  cs: 'csharp',
  sh: 'shellscript',
  bash: 'shellscript',
  zsh: 'shellscript',
  sql: 'sql',
  graphql: 'graphql',
  gql: 'graphql',
  json: 'json',
  jsonc: 'json',
  yaml: 'yaml',
  yml: 'yaml',
  toml: 'toml',
  md: 'markdown',
  mdx: 'markdown',
  html: 'html',
  htm: 'html',
  css: 'css',
  scss: 'scss',
  less: 'less',
  vue: 'vue',
  svelte: 'svelte',
};

/** Languages Prettier can parse (its bundled parsers, all via `typescript`). */
const PRETTIER_LANGS = new Set(['typescript', 'tsx', 'javascript', 'jsx']);

function extensionOf(path: string): string {
  const base = path.split(/[/\\]/).pop() ?? path;
  const dot = base.lastIndexOf('.');
  if (dot < 0) return '';
  return base.slice(dot + 1).toLowerCase();
}

/**
 * Shiki language id for a source path, or `text` when unknown. C-family paths
 * stay `text` (loading their grammars has trapped WebKit — see
 * `pierreFileLang`).
 */
export function sourceLangForPath(path?: string | null): SourceSyntaxLang {
  if (!path) return 'text';
  if (isPierreCFamilyPath(path)) return 'text';
  return EXT_TO_LANG[extensionOf(path)] ?? 'text';
}

/** True when Prettier should format this language's generated declaration. */
export function isPrettierSourceLang(lang: SourceSyntaxLang): boolean {
  return PRETTIER_LANGS.has(lang);
}
