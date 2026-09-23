/**
 * Prettier vendored *outside* the Cottontail bundle.
 *
 * Cottontail re-bundles Prettier's already-minified plugin code and renames a
 * local parameter to a name that collides with an outer function used inside a
 * closure (`e3 is not a function`), so `prettier.format` throws for every
 * declaration in the renderer. esbuild bundles this entry correctly; the output
 * is loaded as a classic `<script>` before the mainview module (see
 * `index.html`) and registered via `setPrettierProvider` in `index.tsx`.
 *
 * This file is never imported by the app bundle — it exists only as the
 * esbuild entry for `scripts/build-prettier-vendor.ts`.
 */

import * as prettier from "prettier/standalone";
import * as typescript from "prettier/plugins/typescript";
import * as estree from "prettier/plugins/estree";

export { prettier, typescript, estree };
