/**
 * Tokenize a SubsystemComponent into a flat token stream for the detail panel.
 *
 * Pipeline: generate declaration string → format with Prettier → tokenize
 * with Shiki + Pierre themes. The `component.tokens` field, when present,
 * overrides the entire pipeline (for pre-tokenized data from graphify).
 *
 * This function is async because Prettier's format() is async.
 */

import type { PierreSyntaxThemeName } from '../pierre/pierreSyntaxTheme';
import type { SubsystemComponent, SubsystemDeclToken } from './model';
import { generateDeclarationString } from './formatDeclaration';
import { tokenizeFormatted } from './tokenizeFormatted';

// Lazy-loaded Prettier to avoid startup cost.
let prettierPromise: Promise<typeof import('prettier/standalone')> | null = null;
let prettierPluginsPromise: Promise<{
  typescript: typeof import('prettier/plugins/typescript');
  estree: typeof import('prettier/plugins/estree');
}> | null = null;

async function getPrettier() {
  if (!prettierPromise) {
    prettierPromise = import('prettier/standalone');
  }
  if (!prettierPluginsPromise) {
    prettierPluginsPromise = Promise.all([
      import('prettier/plugins/typescript'),
      import('prettier/plugins/estree'),
    ]).then(([typescript, estree]) => ({ typescript, estree }));
  }
  const [prettier, plugins] = await Promise.all([prettierPromise, prettierPluginsPromise]);
  return { prettier, plugins };
}

/**
 * Tokenize a SubsystemComponent into SubsystemDeclToken[].
 *
 * When `component.tokens` is present (pre-tokenized data from the wire),
 * it's returned as-is. Otherwise the pipeline generates a TypeScript
 * declaration string, formats it with Prettier, and tokenizes the output.
 */
export async function tokenizeComponent(
  component: SubsystemComponent,
  printWidth = 80,
  themeName: PierreSyntaxThemeName = 'pierre-dark',
): Promise<SubsystemDeclToken[]> {
  // Pre-tokenized tokens from the wire take precedence.
  if (component.tokens) return component.tokens;

  // External kind — not valid TypeScript, bypass Prettier.
  const kind = component.detail?.kind ?? component.construct;
  if (kind === 'external') {
    const label = component.detail?.kind === 'external' ? component.detail.label : component.name;
    const escaped = label.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    return tokenizeFormatted(`external '${escaped}'`, themeName);
  }

  // Generate → format → tokenize
  const raw = generateDeclarationString(component);
  const { prettier, plugins } = await getPrettier();
  const formatted = await prettier.format(raw, {
    parser: 'typescript',
    plugins: [plugins.typescript, plugins.estree],
    printWidth,
  });

  return tokenizeFormatted(formatted, themeName);
}
