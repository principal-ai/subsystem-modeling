/**
 * Tokenize a formatted source string into SubsystemDeclToken[] using Shiki +
 * Pierre themes (same highlighter stack as @pierre/diffs).
 */

import { tokenizeWithPierreSyntax } from '../pierre/syntaxTokens';
import type { PierreSyntaxThemeName } from '../pierre/pierreSyntaxTheme';
import type { SourceSyntaxLang } from '../pierre/sourceLang';
import type { SubsystemDeclToken } from './model';

/**
 * Tokenize a source string into SubsystemDeclToken[]. The input should already
 * be formatted (or be valid for the language). `lang` picks the grammar.
 */
export function tokenizeFormatted(
  code: string,
  themeName: PierreSyntaxThemeName = 'pierre-dark',
  lang: SourceSyntaxLang = 'typescript',
): Promise<SubsystemDeclToken[]> {
  return tokenizeWithPierreSyntax(code, themeName, lang);
}
