import React from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { GraphRenderer } from '../../components/GraphRenderer';
import type { ExtendedCanvas } from '@principal-ai/subsystems-core';
import { ThemeProvider, defaultEditorTheme } from '@principal-ade/industry-theme';

const meta = {
  title: 'Audit/CanvasNodeTypes',
  component: GraphRenderer,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <ThemeProvider theme={defaultEditorTheme}>
        <Story />
      </ThemeProvider>
    ),
  ],
} satisfies Meta<typeof GraphRenderer>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Canvas showing all standard JSON Canvas node types
 */
const allNodeTypesCanvas: ExtendedCanvas = {
  nodes: [
    // Text Node
    {
      id: 'text-node',
      type: 'text',
      x: 100,
      y: 100,
      width: 180,
      height: 100,
      text: '# Text Node\n\nMarkdown content here',
      color: 6, // purple
      pv: {
        nodeType: 'text-example',
        shape: 'rectangle',
        icon: 'FileText',
      },
    },
    // File Node
    {
      id: 'file-node',
      type: 'file',
      x: 350,
      y: 100,
      width: 180,
      height: 100,
      file: 'src/components/App.tsx',
      color: 4, // green
      pv: {
        nodeType: 'file-example',
        shape: 'rectangle',
        icon: 'FileCode',
      },
    },
    // Link Node
    {
      id: 'link-node',
      type: 'link',
      x: 600,
      y: 100,
      width: 180,
      height: 100,
      url: 'https://github.com/example/repo',
      color: 5, // cyan
      pv: {
        nodeType: 'link-example',
        shape: 'rectangle',
        icon: 'Link',
      },
    },
    // Group Node (rendered as container)
    {
      id: 'group-node',
      type: 'group',
      x: 100,
      y: 280,
      width: 300,
      height: 150,
      label: 'Group Container',
      color: 3, // yellow
      pv: {
        nodeType: 'group-example',
        shape: 'rectangle',
        icon: 'Folder',
      },
    },
    // Text node inside group
    {
      id: 'grouped-text',
      type: 'text',
      x: 130,
      y: 320,
      width: 120,
      height: 60,
      text: 'Inside Group',
      color: 6,
      pv: {
        nodeType: 'grouped-item',
        shape: 'rectangle',
      },
    },
  ],
  edges: [],
  pv: {
    version: '1.0.0',
    name: 'Canvas Node Types',
    description: 'All standard JSON Canvas node types',
    edgeTypes: {},
  },
};

export const AllNodeTypes: Story = {
  args: {
    canvas: allNodeTypesCanvas,
    width: 900,
    height: 500,
  },
  parameters: {
    docs: {
      description: {
        story: `
**All JSON Canvas Node Types**

This story displays the 4 standard JSON Canvas node types:

- **Text Node** - Contains markdown text content (\`text\` field)
- **File Node** - References a file path (\`file\` field)
- **Link Node** - References a URL (\`url\` field)
- **Group Node** - Container for grouping other nodes (\`label\` field)
        `,
      },
    },
  },
};

/**
 * Canvas showing text nodes with different content types
 */
const textNodesCanvas: ExtendedCanvas = {
  nodes: [
    {
      id: 'text-plain',
      type: 'text',
      x: 100,
      y: 100,
      width: 160,
      height: 80,
      text: 'Plain text content',
      color: 6,
      pv: {
        nodeType: 'text-plain',
        shape: 'rectangle',
        icon: 'Type',
      },
    },
    {
      id: 'text-heading',
      type: 'text',
      x: 300,
      y: 100,
      width: 160,
      height: 80,
      text: '# Heading\n\nWith paragraph',
      color: 6,
      pv: {
        nodeType: 'text-heading',
        shape: 'rectangle',
        icon: 'Heading',
      },
    },
    {
      id: 'text-list',
      type: 'text',
      x: 500,
      y: 100,
      width: 180,
      height: 100,
      text: '# Todo List\n\n- Item 1\n- Item 2\n- Item 3',
      color: 6,
      pv: {
        nodeType: 'text-list',
        shape: 'rectangle',
        icon: 'List',
      },
    },
    {
      id: 'text-code',
      type: 'text',
      x: 100,
      y: 240,
      width: 200,
      height: 100,
      text: '# Code Block\n\n```js\nconst x = 1;\n```',
      color: 6,
      pv: {
        nodeType: 'text-code',
        shape: 'rectangle',
        icon: 'Code',
      },
    },
    {
      id: 'text-long',
      type: 'text',
      x: 340,
      y: 240,
      width: 220,
      height: 120,
      text: '# Long Content\n\nThis is a longer text node with multiple paragraphs.\n\nIt demonstrates how text wraps within the node bounds.',
      color: 6,
      pv: {
        nodeType: 'text-long',
        shape: 'rectangle',
        icon: 'AlignLeft',
      },
    },
  ],
  edges: [],
  pv: {
    version: '1.0.0',
    name: 'Text Node Variations',
    description: 'Different text content types',
    edgeTypes: {},
  },
};

export const TextNodes: Story = {
  args: {
    canvas: textNodesCanvas,
    width: 800,
    height: 420,
  },
  parameters: {
    docs: {
      description: {
        story: `
**Text Node Variations**

Text nodes (\`type: 'text'\`) can contain various markdown content:
- Plain text
- Headings with paragraphs
- Lists
- Code blocks
- Long multi-paragraph content
        `,
      },
    },
  },
};

/**
 * Canvas showing file nodes with different file types
 */
const fileNodesCanvas: ExtendedCanvas = {
  nodes: [
    {
      id: 'file-ts',
      type: 'file',
      x: 100,
      y: 100,
      width: 180,
      height: 80,
      file: 'src/index.ts',
      color: 4,
      pv: {
        nodeType: 'file-typescript',
        shape: 'rectangle',
        icon: 'FileCode',
      },
    },
    {
      id: 'file-tsx',
      type: 'file',
      x: 320,
      y: 100,
      width: 200,
      height: 80,
      file: 'src/components/App.tsx',
      color: 5,
      pv: {
        nodeType: 'file-react',
        shape: 'rectangle',
        icon: 'Component',
      },
    },
    {
      id: 'file-json',
      type: 'file',
      x: 560,
      y: 100,
      width: 160,
      height: 80,
      file: 'package.json',
      color: 3,
      pv: {
        nodeType: 'file-json',
        shape: 'rectangle',
        icon: 'Braces',
      },
    },
    {
      id: 'file-md',
      type: 'file',
      x: 100,
      y: 220,
      width: 160,
      height: 80,
      file: 'docs/README.md',
      color: 6,
      pv: {
        nodeType: 'file-markdown',
        shape: 'rectangle',
        icon: 'BookOpen',
      },
    },
    {
      id: 'file-subpath',
      type: 'file',
      x: 300,
      y: 220,
      width: 220,
      height: 100,
      file: 'docs/architecture.md',
      subpath: '#database-schema',
      color: 6,
      pv: {
        nodeType: 'file-with-subpath',
        shape: 'rectangle',
        icon: 'Hash',
      },
    },
    {
      id: 'file-image',
      type: 'file',
      x: 560,
      y: 220,
      width: 160,
      height: 80,
      file: 'assets/logo.png',
      color: 2,
      pv: {
        nodeType: 'file-image',
        shape: 'rectangle',
        icon: 'Image',
      },
    },
  ],
  edges: [],
  pv: {
    version: '1.0.0',
    name: 'File Node Variations',
    description: 'Different file types and subpaths',
    edgeTypes: {},
  },
};

export const FileNodes: Story = {
  args: {
    canvas: fileNodesCanvas,
    width: 800,
    height: 380,
  },
  parameters: {
    docs: {
      description: {
        story: `
**File Node Variations**

File nodes (\`type: 'file'\`) reference external files:
- TypeScript files
- React components (TSX)
- JSON config files
- Markdown documentation
- Files with subpath (heading/block link)
- Image assets

The \`file\` field contains the path, and optional \`subpath\` can reference a specific section.
        `,
      },
    },
  },
};

/**
 * Canvas showing link nodes with different URL types
 */
const linkNodesCanvas: ExtendedCanvas = {
  nodes: [
    {
      id: 'link-github',
      type: 'link',
      x: 100,
      y: 100,
      width: 200,
      height: 80,
      url: 'https://github.com/anthropics/claude',
      color: 0, // default/gray
      pv: {
        nodeType: 'link-github',
        shape: 'rectangle',
        icon: 'Github',
      },
    },
    {
      id: 'link-docs',
      type: 'link',
      x: 340,
      y: 100,
      width: 200,
      height: 80,
      url: 'https://docs.example.com/api',
      color: 5,
      pv: {
        nodeType: 'link-documentation',
        shape: 'rectangle',
        icon: 'Book',
      },
    },
    {
      id: 'link-api',
      type: 'link',
      x: 580,
      y: 100,
      width: 180,
      height: 80,
      url: 'https://api.example.com/v1',
      color: 4,
      pv: {
        nodeType: 'link-api',
        shape: 'rectangle',
        icon: 'Cloud',
      },
    },
    {
      id: 'link-jira',
      type: 'link',
      x: 100,
      y: 220,
      width: 200,
      height: 80,
      url: 'https://jira.example.com/browse/PROJ-123',
      color: 5,
      pv: {
        nodeType: 'link-ticket',
        shape: 'rectangle',
        icon: 'Ticket',
      },
    },
    {
      id: 'link-figma',
      type: 'link',
      x: 340,
      y: 220,
      width: 200,
      height: 80,
      url: 'https://figma.com/file/abc123',
      color: 6,
      pv: {
        nodeType: 'link-design',
        shape: 'rectangle',
        icon: 'Palette',
      },
    },
    {
      id: 'link-slack',
      type: 'link',
      x: 580,
      y: 220,
      width: 180,
      height: 80,
      url: 'https://slack.com/channel/dev',
      color: 2,
      pv: {
        nodeType: 'link-chat',
        shape: 'rectangle',
        icon: 'MessageCircle',
      },
    },
  ],
  edges: [],
  pv: {
    version: '1.0.0',
    name: 'Link Node Variations',
    description: 'Different URL/link types',
    edgeTypes: {},
  },
};

export const LinkNodes: Story = {
  args: {
    canvas: linkNodesCanvas,
    width: 850,
    height: 380,
  },
  parameters: {
    docs: {
      description: {
        story: `
**Link Node Variations**

Link nodes (\`type: 'link'\`) reference external URLs:
- GitHub repositories
- Documentation sites
- API endpoints
- Issue trackers (Jira, Linear)
- Design tools (Figma)
- Communication tools (Slack)

The \`url\` field contains the full URL.
        `,
      },
    },
  },
};

/**
 * Canvas showing a realistic mixed-type diagram
 */
const mixedTypesCanvas: ExtendedCanvas = {
  nodes: [
    // Documentation (file)
    {
      id: 'docs',
      type: 'file',
      x: 100,
      y: 100,
      width: 160,
      height: 80,
      file: 'docs/architecture.md',
      color: 6,
      pv: {
        nodeType: 'documentation',
        shape: 'rectangle',
        icon: 'BookOpen',
      },
    },
    // Design link
    {
      id: 'design',
      type: 'link',
      x: 100,
      y: 220,
      width: 160,
      height: 80,
      url: 'https://figma.com/file/design',
      color: 6,
      pv: {
        nodeType: 'design-spec',
        shape: 'rectangle',
        icon: 'Palette',
      },
    },
    // Main component (file)
    {
      id: 'component',
      type: 'file',
      x: 350,
      y: 160,
      width: 180,
      height: 80,
      file: 'src/components/Feature.tsx',
      color: 4,
      pv: {
        nodeType: 'component',
        shape: 'rectangle',
        icon: 'Component',
      },
    },
    // Notes (text)
    {
      id: 'notes',
      type: 'text',
      x: 350,
      y: 280,
      width: 180,
      height: 100,
      text: '# Implementation Notes\n\n- Check edge cases\n- Add tests\n- Update docs',
      color: 3,
      pv: {
        nodeType: 'notes',
        shape: 'rectangle',
        icon: 'StickyNote',
      },
    },
    // API endpoint (link)
    {
      id: 'api',
      type: 'link',
      x: 600,
      y: 100,
      width: 160,
      height: 80,
      url: 'https://api.example.com/feature',
      color: 5,
      pv: {
        nodeType: 'api-endpoint',
        shape: 'rectangle',
        icon: 'Cloud',
      },
    },
    // Test file (file)
    {
      id: 'tests',
      type: 'file',
      x: 600,
      y: 220,
      width: 160,
      height: 80,
      file: 'src/components/Feature.test.tsx',
      color: 4,
      pv: {
        nodeType: 'test-file',
        shape: 'rectangle',
        icon: 'TestTube',
      },
    },
    // Issue tracker (link)
    {
      id: 'ticket',
      type: 'link',
      x: 600,
      y: 340,
      width: 160,
      height: 80,
      url: 'https://jira.example.com/PROJ-456',
      color: 5,
      pv: {
        nodeType: 'ticket',
        shape: 'rectangle',
        icon: 'Ticket',
      },
    },
  ],
  edges: [
    {
      id: 'docs-to-component',
      fromNode: 'docs',
      toNode: 'component',
      fromSide: 'right',
      toSide: 'left',
      pv: { edgeType: 'reference' },
    },
    {
      id: 'design-to-component',
      fromNode: 'design',
      toNode: 'component',
      fromSide: 'right',
      toSide: 'left',
      pv: { edgeType: 'reference' },
    },
    {
      id: 'component-to-api',
      fromNode: 'component',
      toNode: 'api',
      fromSide: 'right',
      toSide: 'left',
      pv: { edgeType: 'uses' },
    },
    {
      id: 'component-to-tests',
      fromNode: 'component',
      toNode: 'tests',
      fromSide: 'right',
      toSide: 'left',
      pv: { edgeType: 'tested-by' },
    },
    {
      id: 'notes-to-ticket',
      fromNode: 'notes',
      toNode: 'ticket',
      fromSide: 'right',
      toSide: 'left',
      pv: { edgeType: 'tracks' },
    },
  ],
  pv: {
    version: '1.0.0',
    name: 'Feature Development Map',
    description: 'Mixed node types showing a feature development context',
    edgeTypes: {
      reference: {
        style: 'dashed',
        color: '#8b5cf6',
        directed: true,
      },
      uses: {
        style: 'solid',
        color: '#22c55e',
        directed: true,
      },
      'tested-by': {
        style: 'dotted',
        color: '#3b82f6',
        directed: true,
      },
      tracks: {
        style: 'dashed',
        color: '#f97316',
        directed: true,
      },
    },
  },
};

export const MixedTypes: Story = {
  args: {
    canvas: mixedTypesCanvas,
    width: 850,
    height: 500,
  },
  parameters: {
    docs: {
      description: {
        story: `
**Mixed Node Types - Feature Development Map**

A realistic example showing how different node types work together:
- **File nodes**: Source code, tests, documentation
- **Link nodes**: API endpoints, design specs, issue trackers
- **Text nodes**: Notes and annotations

This demonstrates a typical feature development context where you'd reference:
- Architecture docs (file)
- Figma designs (link)
- Source components (file)
- API endpoints (link)
- Test files (file)
- Issue tickets (link)
- Implementation notes (text)
        `,
      },
    },
  },
};

/**
 * Canvas demonstrating edges rendering above group nodes
 */
const edgesOverGroupCanvas: ExtendedCanvas = {
  nodes: [
    // Group node (should render behind edges)
    {
      id: 'group-1',
      type: 'group',
      x: 150,
      y: 80,
      width: 300,
      height: 200,
      label: 'Processing Group',
      color: 3, // yellow
      pv: {
        nodeType: 'group',
        shape: 'rectangle',
      },
    },
    // Node before group
    {
      id: 'start',
      type: 'text',
      x: 20,
      y: 150,
      width: 100,
      height: 60,
      text: 'Start',
      color: 4,
      pv: {
        nodeType: 'process',
        shape: 'rectangle',
        icon: 'Play',
      },
    },
    // Node inside group
    {
      id: 'process-1',
      type: 'text',
      x: 200,
      y: 120,
      width: 100,
      height: 60,
      text: 'Process A',
      color: 5,
      pv: {
        nodeType: 'process',
        shape: 'rectangle',
        icon: 'Settings',
      },
    },
    // Another node inside group
    {
      id: 'process-2',
      type: 'text',
      x: 200,
      y: 200,
      width: 100,
      height: 60,
      text: 'Process B',
      color: 5,
      pv: {
        nodeType: 'process',
        shape: 'rectangle',
        icon: 'Cog',
      },
    },
    // Node after group
    {
      id: 'end',
      type: 'text',
      x: 500,
      y: 150,
      width: 100,
      height: 60,
      text: 'End',
      color: 4,
      pv: {
        nodeType: 'process',
        shape: 'rectangle',
        icon: 'CheckCircle',
      },
    },
  ],
  edges: [
    // Edge crossing over the group
    {
      id: 'start-to-process1',
      fromNode: 'start',
      toNode: 'process-1',
      fromSide: 'right',
      toSide: 'left',
      pv: { edgeType: 'flow' },
    },
    // Edge within group
    {
      id: 'process1-to-process2',
      fromNode: 'process-1',
      toNode: 'process-2',
      fromSide: 'bottom',
      toSide: 'top',
      pv: { edgeType: 'flow' },
    },
    // Edge crossing out of group
    {
      id: 'process2-to-end',
      fromNode: 'process-2',
      toNode: 'end',
      fromSide: 'right',
      toSide: 'left',
      pv: { edgeType: 'flow' },
    },
  ],
  pv: {
    version: '1.0.0',
    name: 'Edges Over Groups',
    description: 'Test that edges render above group nodes',
    edgeTypes: {
      flow: {
        style: 'solid',
        color: '#3b82f6',
        directed: true,
      },
    },
  },
};

export const EdgesOverGroups: Story = {
  args: {
    canvas: edgesOverGroupCanvas,
    width: 650,
    height: 350,
  },
  parameters: {
    docs: {
      description: {
        story: `
**Edges Rendering Above Groups**

This story tests that edges properly render above group nodes.
- The yellow group container should be behind all edges
- Edges connecting to nodes inside the group should be visible
- Edges crossing over the group should not be hidden
        `,
      },
    },
  },
};

/**
 * Interactive comparison template
 */
const NodeTypeComparisonTemplate = () => {
  return (
    <div style={{ padding: 20, fontFamily: 'system-ui' }}>
      <h2 style={{ marginBottom: 20 }}>JSON Canvas Node Types Comparison</h2>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 20,
          marginBottom: 30,
        }}
      >
        <div
          style={{
            padding: 16,
            backgroundColor: '#f3e8ff',
            borderRadius: 8,
            border: '2px solid #8b5cf6',
          }}
        >
          <h4 style={{ margin: '0 0 8px 0', color: '#6b21a8' }}>Text Node</h4>
          <code style={{ fontSize: 11, display: 'block', marginBottom: 8 }}>type: 'text'</code>
          <div style={{ fontSize: 12, color: '#6b21a8' }}>
            <strong>Fields:</strong>
            <ul style={{ margin: '4px 0', paddingLeft: 16 }}>
              <li>
                <code>text</code> - Markdown content
              </li>
            </ul>
          </div>
        </div>

        <div
          style={{
            padding: 16,
            backgroundColor: '#dcfce7',
            borderRadius: 8,
            border: '2px solid #22c55e',
          }}
        >
          <h4 style={{ margin: '0 0 8px 0', color: '#166534' }}>File Node</h4>
          <code style={{ fontSize: 11, display: 'block', marginBottom: 8 }}>type: 'file'</code>
          <div style={{ fontSize: 12, color: '#166534' }}>
            <strong>Fields:</strong>
            <ul style={{ margin: '4px 0', paddingLeft: 16 }}>
              <li>
                <code>file</code> - File path
              </li>
              <li>
                <code>subpath?</code> - Section link
              </li>
            </ul>
          </div>
        </div>

        <div
          style={{
            padding: 16,
            backgroundColor: '#cffafe',
            borderRadius: 8,
            border: '2px solid #06b6d4',
          }}
        >
          <h4 style={{ margin: '0 0 8px 0', color: '#0e7490' }}>Link Node</h4>
          <code style={{ fontSize: 11, display: 'block', marginBottom: 8 }}>type: 'link'</code>
          <div style={{ fontSize: 12, color: '#0e7490' }}>
            <strong>Fields:</strong>
            <ul style={{ margin: '4px 0', paddingLeft: 16 }}>
              <li>
                <code>url</code> - Full URL
              </li>
            </ul>
          </div>
        </div>

        <div
          style={{
            padding: 16,
            backgroundColor: '#fef9c3',
            borderRadius: 8,
            border: '2px solid #eab308',
          }}
        >
          <h4 style={{ margin: '0 0 8px 0', color: '#a16207' }}>Group Node</h4>
          <code style={{ fontSize: 11, display: 'block', marginBottom: 8 }}>type: 'group'</code>
          <div style={{ fontSize: 12, color: '#a16207' }}>
            <strong>Fields:</strong>
            <ul style={{ margin: '4px 0', paddingLeft: 16 }}>
              <li>
                <code>label?</code> - Group name
              </li>
              <li>
                <code>background?</code> - Image
              </li>
            </ul>
          </div>
        </div>
      </div>

      <h3 style={{ marginBottom: 16 }}>Live Example: All Node Types</h3>
      <GraphRenderer canvas={allNodeTypesCanvas} width={900} height={500} />

      <div
        style={{
          marginTop: 24,
          padding: 16,
          backgroundColor: '#f5f5f5',
          borderRadius: 8,
        }}
      >
        <h4 style={{ margin: '0 0 12px 0' }}>JSON Canvas Spec</h4>
        <p style={{ fontSize: 13, margin: 0, lineHeight: 1.6 }}>
          These node types follow the{' '}
          <a
            href="https://jsoncanvas.org/"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: '#3b82f6' }}
          >
            JSON Canvas specification
          </a>
          . Each node type serves a specific purpose:
        </p>
        <ul style={{ fontSize: 13, lineHeight: 1.8, margin: '8px 0 0 0', paddingLeft: 20 }}>
          <li>
            <strong>Text</strong> - For notes, descriptions, and embedded markdown content
          </li>
          <li>
            <strong>File</strong> - For referencing local files in your project
          </li>
          <li>
            <strong>Link</strong> - For external resources, APIs, documentation, tools
          </li>
          <li>
            <strong>Group</strong> - For visually organizing related nodes together
          </li>
        </ul>
      </div>
    </div>
  );
};

export const NodeTypeComparison: Story = {
  render: () => <NodeTypeComparisonTemplate />,
  parameters: {
    docs: {
      description: {
        story:
          'Interactive comparison view showing all JSON Canvas node types with field documentation.',
      },
    },
  },
};
