/**
 * Language overrides for `@pierre/diffs` file rendering.
 *
 * Pierre's default extension map sends `.h` → `objective-cpp`. Loading
 * C-family Shiki grammars (`cpp` / `objective-cpp`) in CodeView has trapped
 * WebKit (`JSString::getIndex` / EXC_BREAKPOINT), so we force plain text for
 * those paths until Pierre/WebKit is safe with them.
 */

const C_FAMILY_EXT = new Set([
  'c',
  'h',
  'cc',
  'cpp',
  'cxx',
  'hpp',
  'hh',
  'mm',
  'm',
]);

function extensionOf(path: string): string {
  const base = path.split(/[/\\]/).pop() ?? path;
  const dot = base.lastIndexOf('.');
  if (dot < 0) return '';
  return base.slice(dot + 1).toLowerCase();
}

/** True when Pierre would (or we would) treat this path as C-family source. */
export function isPierreCFamilyPath(path: string): boolean {
  return C_FAMILY_EXT.has(extensionOf(path));
}

/**
 * Explicit `lang` for a Pierre `FileContents` object.
 *
 * - C-family → `'text'` (WebKit-safe; no cpp/obj-c++ Shiki grammar)
 * - everything else → `undefined` (Pierre infers from the filename)
 */
export function pierreLangForPath(path: string): 'text' | undefined {
  return isPierreCFamilyPath(path) ? 'text' : undefined;
}

