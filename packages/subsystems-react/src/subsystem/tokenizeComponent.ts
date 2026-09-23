/**
 * Tokenize a SubsystemComponent into a flat token stream for the detail panel.
 *
 * Pipeline: generate declaration string → (JS/TS only) format with Prettier →
 * tokenize with Shiki + Pierre themes, using the grammar inferred from the
 * component's file. The `component.tokens` field, when present, overrides the
 * entire pipeline (for pre-tokenized data from graphify).
 *
 * This function is async because Prettier's format() is async.
 */

import type { PierreSyntaxThemeName } from '../pierre/pierreSyntaxTheme';
import {
  isPrettierSourceLang,
  sourceLangForPath,
} from '../pierre/sourceLang';
import type { SubsystemComponent, SubsystemDeclToken } from './model';
import { generateDeclarationString } from './formatDeclaration';
import { tokenizeFormatted } from './tokenizeFormatted';

// Lazy-loaded Prettier to avoid startup cost.
let prettierPromise: Promise<typeof import('prettier/standalone')> | null = null;
let prettierPluginsPromise: Promise<{
  typescript: typeof import('prettier/plugins/typescript');
  estree: typeof import('prettier/plugins/estree');
}> | null = null;
/** One-shot guard so a broken host bundler warns once, not per component. */
let prettierFailureLogged = false;

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
 * it's returned as-is. Otherwise the pipeline generates a declaration string,
 * formats it with Prettier when the inferred language is JS/TS, and tokenizes
 * the output with that language's grammar.
 */
export async function tokenizeComponent(
  component: SubsystemComponent,
  printWidth = 80,
  themeName: PierreSyntaxThemeName = 'pierre-dark',
): Promise<SubsystemDeclToken[]> {
  // Pre-tokenized tokens from the wire take precedence.
  if (component.tokens) return component.tokens;

  const lang = sourceLangForPath(component.file);

  // External kind — not valid code, bypass Prettier; plain text.
  const kind = component.declaration?.kind ?? component.construct;
  if (kind === 'external') {
    const label = component.declaration?.kind === 'external' ? component.declaration.label : component.name;
    const escaped = label.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    return tokenizeFormatted(`external '${escaped}'`, themeName, 'text');
  }

  // Custom entity — an actor (Person/agent/queue), not code; plain text.
  if (kind === 'custom_entity') {
    return tokenizeFormatted(generateDeclarationString(component), themeName, 'text');
  }

  // Generate → (JS/TS only) format → tokenize.
  //
  // Prettier ships parsers for JS/TS (and CSS/HTML/…) only — never run it for
  // other languages. Even for JS/TS it's best-effort: some host bundlers
  // (Electrobun's) mangle Prettier's internal cross-module calls, so formatting
  // can throw. Fall back to the unformatted declaration rather than rendering
  // nothing — the panel is still correct, just not width-wrapped.
  const raw = generateDeclarationString(component);
  let formatted = raw;
  if (isPrettierSourceLang(lang)) {
    try {
      const { prettier, plugins } = await getPrettier();
      formatted = await prettier.format(raw, {
        parser: 'typescript',
        plugins: [plugins.typescript, plugins.estree],
        printWidth,
      });
    } catch (err) {
      if (!prettierFailureLogged) {
        prettierFailureLogged = true;
        console.warn(
          '[subsystem] prettier format failed; tokenizing unformatted declarations for this session',
          err,
        );
      }
    }
  }

  return tokenizeFormatted(formatted, themeName, lang);
}
