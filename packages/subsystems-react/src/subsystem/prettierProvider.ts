/**
 * Optional host-provided Prettier.
 *
 * Some host bundlers mangle Prettier's already-minified plugin code. Cottontail
 * (Electrobun) re-bundles it and renames a local parameter to a name that
 * collides with an outer function used inside a closure (`e3 is not a
 * function`), which breaks `prettier.format` for every input in the renderer.
 *
 * A host can load a correctly-bundled Prettier outside its own bundler and
 * register it here; `tokenizeComponent` prefers it over the bundled dynamic
 * import. When nothing is registered the built-in import path is unchanged.
 */

export type PrettierBundle = {
  prettier: typeof import('prettier/standalone');
  plugins: {
    typescript: typeof import('prettier/plugins/typescript');
    estree: typeof import('prettier/plugins/estree');
  };
};

let provider: PrettierBundle | null = null;

/** Register (or clear with `null`) a host-provided Prettier bundle. */
export function setPrettierProvider(bundle: PrettierBundle | null): void {
  provider = bundle;
}

/** The currently registered bundle, if any. */
export function getPrettierProvider(): PrettierBundle | null {
  return provider;
}
