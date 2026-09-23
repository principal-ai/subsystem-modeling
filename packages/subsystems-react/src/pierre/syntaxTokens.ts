/**
 * Tokenize source text with Shiki + Pierre themes — same stack as @pierre/diffs.
 */

import {
  createHighlighter,
  type BundledLanguage,
  type Highlighter,
  type ThemeInput,
} from 'shiki';
import pierreDark from '@pierre/theme/pierre-dark';
import pierreLight from '@pierre/theme/pierre-light';
import type { SubsystemDeclToken } from '../subsystem/model';
import type { PierreSyntaxThemeName } from './pierreSyntaxTheme';
import type { SourceSyntaxLang } from './sourceLang';

let highlighterPromise: Promise<Highlighter> | null = null;

async function getPierreHighlighter(): Promise<Highlighter> {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighter({
      themes: [
        pierreDark as unknown as ThemeInput,
        pierreLight as unknown as ThemeInput,
      ],
      langs: ['typescript'],
    });
  }
  return highlighterPromise;
}

/** Load a grammar on demand; fall back to `text` when it isn't available. */
async function resolveLang(
  highlighter: Highlighter,
  lang: SourceSyntaxLang,
): Promise<BundledLanguage | 'text'> {
  if (lang === 'text') return 'text';
  try {
    if (!highlighter.getLoadedLanguages().includes(lang)) {
      await highlighter.loadLanguage(lang as BundledLanguage);
    }
    return lang as BundledLanguage;
  } catch {
    return 'text';
  }
}

function normalizeColor(color?: string): string | undefined {
  return color?.toLowerCase();
}

/**
 * Tokenize code using Pierre's Shiki themes. Each token carries the resolved
 * foreground color Pierre would render. `lang` is the inferred source language
 * (`text` when unknown) — TS by default for backward compatibility.
 */
export async function tokenizeWithPierreSyntax(
  code: string,
  themeName: PierreSyntaxThemeName,
  lang: SourceSyntaxLang = 'typescript',
): Promise<SubsystemDeclToken[]> {
  const highlighter = await getPierreHighlighter();
  const resolved = await resolveLang(highlighter, lang);
  const { tokens } = highlighter.codeToTokens(code, {
    lang: resolved,
    theme: themeName,
  });

  const result: SubsystemDeclToken[] = [];
  for (let lineIndex = 0; lineIndex < tokens.length; lineIndex++) {
    const line = tokens[lineIndex];
    for (const token of line) {
      if (!token.content) continue;
      result.push({
        text: token.content,
        kind: 'punctuation',
        color: normalizeColor(token.color),
      });
    }
    if (lineIndex < tokens.length - 1) {
      result.push({ text: '', kind: 'newline' });
    }
  }
  return result;
}
