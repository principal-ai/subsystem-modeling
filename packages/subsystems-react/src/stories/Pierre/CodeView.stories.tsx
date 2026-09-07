/**
 * Demo: Pierre CodeView with snippets from different files.
 *
 * Throughlines want many short windows across files in one scroll —
 * CodeView is the Pierre primitive for that (virtualized list of file items).
 */
import React, { useMemo, useRef } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import {
  CodeView,
  type CodeViewHandle,
  type CodeViewItem,
} from '@pierre/diffs/react';
import { ThemeProvider, defaultEditorTheme, useTheme } from '@principal-ade/industry-theme';
import { sliceSnippetWindow } from '../../pierre/sliceSnippet';
import { resolvePierreSyntaxThemeName } from '../../pierre/pierreSyntaxTheme';
import componentDeclarationSource from '../../subsystem/ComponentDeclaration.tsx?raw';
import resolveSource from '../../graphify/resolve.ts?raw';
import modelSource from '../../subsystem/model.ts?raw';

type SnippetSpec = {
  id: string;
  path: string;
  contents: string;
  startLine: number;
  endLine: number;
  focusLine?: number;
  label: string;
};

const SNIPPETS: SnippetSpec[] = [
  {
    id: 'step-1',
    path: 'packages/subsystems-react/src/subsystem/ComponentDeclaration.tsx',
    contents: componentDeclarationSource,
    startLine: 252,
    endLine: 270,
    focusLine: 252,
    label: '1 · ComponentDeclaration export',
  },
  {
    id: 'step-2',
    path: 'packages/subsystems-react/src/graphify/resolve.ts',
    contents: resolveSource,
    startLine: 1,
    endLine: 40,
    focusLine: 1,
    label: '2 · graphify resolve',
  },
  {
    id: 'step-3',
    path: 'packages/subsystems-react/src/subsystem/model.ts',
    contents: modelSource,
    startLine: 216,
    endLine: 250,
    focusLine: 216,
    label: '3 · Throughline types',
  },
];

const meta = {
  title: 'Pierre/CodeView',
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <ThemeProvider theme={defaultEditorTheme}>
        <Story />
      </ThemeProvider>
    ),
  ],
} satisfies Meta;

export default meta;
type Story = StoryObj;

function MultiFileSnippetsDemo() {
  const { theme, mode } = useTheme();
  const viewRef = useRef<CodeViewHandle>(null);
  const [activeId, setActiveId] = React.useState<string | null>(SNIPPETS[0]?.id ?? null);

  const sliced = useMemo(() => {
    return SNIPPETS.map((spec) => {
      const slice = sliceSnippetWindow(
        spec.contents,
        spec.startLine,
        spec.endLine,
        2,
        spec.focusLine ?? spec.startLine,
      );
      return { spec, slice };
    });
  }, []);

  const items = useMemo((): CodeViewItem[] => {
    return sliced.map(({ spec, slice }) => ({
      id: spec.id,
      type: 'file' as const,
      file: {
        name: spec.path,
        contents: slice.contents,
        cacheKey: `${spec.id}:${slice.sliceStart}-${slice.sliceEnd}`,
      },
    }));
  }, [sliced]);

  const selectedLines = useMemo(() => {
    if (activeId == null) return null;
    const hit = sliced.find((s) => s.spec.id === activeId);
    if (hit?.slice.focusOffset == null) return null;
    return {
      id: activeId,
      range: { start: hit.slice.focusOffset, end: hit.slice.focusOffset },
    };
  }, [activeId, sliced]);

  const focusStep = (id: string) => {
    setActiveId(id);
    const hit = sliced.find((s) => s.spec.id === id);
    const line = hit?.slice.focusOffset;
    if (line == null) return;
    viewRef.current?.scrollTo({ type: 'line', id, lineNumber: line, align: 'center' });
  };

  const options = useMemo(
    () => ({
      theme: {
        dark: resolvePierreSyntaxThemeName('dark'),
        light: resolvePierreSyntaxThemeName('light'),
      } as const,
      stickyHeaders: true,
      layout: { paddingTop: 12, paddingBottom: 24, gap: 16 },
      ...(mode === 'light' || mode === 'dark' ? { themeType: mode as 'light' | 'dark' } : {}),
    }),
    [mode],
  );

  return (
    <div
      style={{
        display: 'flex',
        height: '100vh',
        background: theme.colors.background,
        color: theme.colors.text,
        fontFamily: theme.fonts.sans,
      }}
    >
      <aside
        style={{
          width: 260,
          flexShrink: 0,
          borderRight: `1px solid ${theme.colors.border ?? '#333'}`,
          padding: 16,
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
          Throughline steps
        </div>
        <div style={{ fontSize: 12, color: theme.colors.textSecondary, marginBottom: 8 }}>
          Click a step to scroll + highlight its site line.
        </div>
        {SNIPPETS.map((spec) => (
          <button
            key={spec.id}
            type="button"
            onClick={() => focusStep(spec.id)}
            style={{
              textAlign: 'left',
              padding: '8px 10px',
              borderRadius: 6,
              border: `1px solid ${theme.colors.border ?? '#333'}`,
              background:
                activeId === spec.id
                  ? (theme.colors.surfaceHover ?? theme.colors.surface ?? 'transparent')
                  : (theme.colors.surface ?? 'transparent'),
              color: theme.colors.text,
              cursor: 'pointer',
              fontSize: 12,
            }}
          >
            {spec.label}
            <div
              style={{
                marginTop: 4,
                fontFamily: theme.fonts.monospace,
                fontSize: 10,
                color: theme.colors.textSecondary,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {spec.path.split('/').pop()}:{spec.startLine}
            </div>
          </button>
        ))}
      </aside>
      <div style={{ flex: 1, minWidth: 0, minHeight: 0 }}>
        <CodeView
          ref={viewRef}
          items={items}
          options={options}
          selectedLines={selectedLines}
          style={{ height: '100%', overflow: 'auto' }}
        />
      </div>
    </div>
  );
}

export const MultiFileSnippets: Story = {
  name: 'Multi-file snippets',
  render: () => <MultiFileSnippetsDemo />,
};
