import type { ReactNode } from 'react';
import {
  PierreFileView,
  PierreWalkthroughCodeView,
  type WalkthroughViewerContext,
} from '@principal-ai/subsystems-react';

/**
 * Showcase fixture files, bundled at build time.
 *
 * Every file under site/showcase/<caseDir> is inlined as raw text by Vite's
 * `import.meta.glob` (keys are project-root-absolute, e.g.
 * `/showcase/orders-api/src/routes/orders.ts`). No fs access, so it works in
 * the static GitHub Pages build and the dev server identically.
 */
const SHOWCASE_FILES = import.meta.glob('/showcase/**/*', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

function fileKey(caseDir: string, path: string): string {
  const norm = path.replace(/^\.?\//, '');
  return `/showcase/${caseDir}/${norm}`;
}

/** Builds a repo-relative → content reader for one showcase case. */
export function makeShowcaseReadFile(caseDir: string) {
  return async (path: string): Promise<string> => {
    const key = fileKey(caseDir, path);
    const contents = SHOWCASE_FILES[key];
    if (contents !== undefined) return contents;
    return [
      `// ${path}`,
      '//',
      `// Not bundled in this showcase. Add the file under`,
      `// site/showcase/${caseDir}/${path} and it will render here.`,
    ].join('\n') + '\n';
  };
}

export interface ShowcaseRenderers {
  renderFileViewer: (file: string) => ReactNode;
  renderWalkthroughViewer: (ctx: WalkthroughViewerContext) => ReactNode;
}

/**
 * Host renderers for `SubsystemComponentGraph` backed by the fixture files of
 * one showcase case — real syntax-highlighted source opens in the drawer when
 * a component, tree entry, or walkthrough step is clicked.
 */
export function makeShowcaseRenderers(caseDir: string): ShowcaseRenderers {
  const readFile = makeShowcaseReadFile(caseDir);
  return {
    renderFileViewer: (file) => (
      <PierreFileView
        filePath={file}
        fileName={file.split('/').pop() ?? file}
        readFile={readFile}
      />
    ),
    renderWalkthroughViewer: (ctx) => (
      <PierreWalkthroughCodeView
        walkthrough={ctx.walkthrough}
        stepIndex={ctx.stepIndex}
        readFile={readFile}
      />
    ),
  };
}
