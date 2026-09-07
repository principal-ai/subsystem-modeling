import { describe, expect, test } from 'bun:test';
import { tokenizeWithPierreSyntax } from './syntaxTokens';

describe('tokenizeWithPierreSyntax', () => {
  test('assigns Pierre dark keyword and type colors', async () => {
    const tokens = await tokenizeWithPierreSyntax(
      'export class Foo extends Bar {}',
      'pierre-dark',
    );
    const joined = tokens.filter((t) => t.kind !== 'newline').map((t) => t.text).join('');
    expect(joined).toBe('export class Foo extends Bar {}');

    const exportTok = tokens.find((t) => t.text === 'export');
    const classTok = tokens.find((t) => t.text === 'class');
    const fooTok = tokens.find((t) => t.text === 'Foo');
    const barTok = tokens.find((t) => t.text === 'Bar');

    expect(exportTok?.color).toBe('#ff678d');
    expect(classTok?.color).toBe('#d568ea');
    expect(fooTok?.color).toBe('#d568ea');
    expect(barTok?.color).toBe('#d568ea');
  });

  test('light theme resolves different palette than dark', async () => {
    const [dark, light] = await Promise.all([
      tokenizeWithPierreSyntax('const x = 1', 'pierre-dark'),
      tokenizeWithPierreSyntax('const x = 1', 'pierre-light'),
    ]);
    const darkConst = dark.find((t) => t.text === 'const');
    const lightConst = light.find((t) => t.text === 'const');
    expect(darkConst?.color).toBeTruthy();
    expect(lightConst?.color).toBeTruthy();
    expect(darkConst?.color).not.toBe(lightConst?.color);
  });
});
