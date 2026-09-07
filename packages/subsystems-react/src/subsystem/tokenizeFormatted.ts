/**
 * Tokenize a formatted TypeScript declaration string into SubsystemDeclToken[]
 * using Shiki + Pierre themes (same highlighter stack as @pierre/diffs).
 */

import { tokenizeWithPierreSyntax } from '../pierre/syntaxTokens';
import type { PierreSyntaxThemeName } from '../pierre/pierreSyntaxTheme';
import type { SubsystemDeclToken } from './model';

/**
 * Tokenize a formatted TypeScript string into SubsystemDeclToken[].
 * The input should already be formatted by Prettier (or be valid TS).
 */
export function tokenizeFormatted(
  code: string,
  themeName: PierreSyntaxThemeName = 'pierre-dark',
): Promise<SubsystemDeclToken[]> {
  return tokenizeWithPierreSyntax(code, themeName);
}
