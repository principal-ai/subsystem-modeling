/**
 * Tokenize TypeScript with Shiki + Pierre themes — same stack as @pierre/diffs.
 */

import { createHighlighter, type Highlighter, type ThemeInput } from 'shiki';
import pierreDark from '@pierre/theme/pierre-dark';
import pierreLight from '@pierre/theme/pierre-light';
import type { SubsystemDeclToken } from '../subsystem/model';
import type { PierreSyntaxThemeName } from './pierreSyntaxTheme';

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

function normalizeColor(color?: string): string | undefined {
  return color?.toLowerCase();
}

/**
 * Tokenize formatted TypeScript using Pierre's Shiki themes.
 * Each token carries the resolved foreground color Pierre would render.
 */
export async function tokenizeWithPierreSyntax(
  code: string,
  themeName: PierreSyntaxThemeName,
): Promise<SubsystemDeclToken[]> {
  const highlighter = await getPierreHighlighter();
  const { tokens } = highlighter.codeToTokens(code, {
    lang: 'typescript',
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
