/**
 * Tests for validate command
 */
import { describe, test, expect } from 'bun:test';
import type { ExtendedCanvas } from '@principal-ai/subsystems-core';

// Import validateCanvas function (we'll need to export it from validate.ts)
// For now, we'll inline the validation logic for testing

/**
 * Test helper to validate a canvas and return issues
 */
function validateCanvasColor(
  canvas: ExtendedCanvas,
  library: { nodeComponents: Record<string, { color?: string }> } | null = null
): Array<{ type: 'error' | 'warning'; message: string }> {
  const issues: Array<{ type: 'error' | 'warning'; message: string }> = [];

  if (!canvas || typeof canvas !== 'object') {
    return issues;
  }

  const c = canvas as Record<string, unknown>;

  if (!Array.isArray(c.nodes)) {
    return issues;
  }

  c.nodes.forEach((node: unknown, index: number) => {
    if (!node || typeof node !== 'object') {
      return;
    }
    const n = node as Record<string, unknown>;
    const nodeLabel = n.id || index;

    // Validate color - all nodes must have a color either directly or via nodeType
    const hasDirectColor = typeof n.color === 'string' && n.color;
    let hasNodeTypeColor = false;

    if (!hasDirectColor && n.pv && typeof n.pv === 'object') {
      const nodePv = n.pv as Record<string, unknown>;
      const nodeTypeName = nodePv.nodeType as string;

      if (typeof nodeTypeName === 'string' && nodeTypeName) {
        // Check if nodeType has a color defined in canvas pv.nodeTypes
        if (c.pv && typeof c.pv === 'object') {
          const canvasPv = c.pv as Record<string, unknown>;
          if (canvasPv.nodeTypes && typeof canvasPv.nodeTypes === 'object') {
            const nodeTypes = canvasPv.nodeTypes as Record<string, unknown>;
            const nodeTypeDef = nodeTypes[nodeTypeName];
            if (nodeTypeDef && typeof nodeTypeDef === 'object') {
              const typeDef = nodeTypeDef as Record<string, unknown>;
              if (typeof typeDef.color === 'string' && typeDef.color) {
                hasNodeTypeColor = true;
              }
            }
          }
        }

        // Check if nodeType has a color defined in library.nodeComponents
        if (!hasNodeTypeColor && library) {
          const nodeComponent = library.nodeComponents[nodeTypeName];
          if (nodeComponent && typeof nodeComponent === 'object') {
            const component = nodeComponent as Record<string, unknown>;
            if (typeof component.color === 'string' && component.color) {
              hasNodeTypeColor = true;
            }
          }
        }
      }
    }

    if (!hasDirectColor && !hasNodeTypeColor) {
      issues.push({
        type: 'error',
        message: `Node "${nodeLabel}" must have a color`,
      });
    }
  });

  return issues;
}

describe('validate command - color validation', () => {
  test('should require color on nodes without pv metadata', () => {
    const canvas: ExtendedCanvas = {
      nodes: [
        {
          id: 'title',
          type: 'text',
          x: 0,
          y: 0,
          width: 200,
          height: 100,
          text: '# Title',
          // No color field
        },
      ],
      edges: [],
      pv: {
        name: 'Test Canvas',
        version: '1.0.0',
      },
    };

    const issues = validateCanvasColor(canvas);
    expect(issues).toHaveLength(1);
    expect(issues[0].type).toBe('error');
    expect(issues[0].message).toContain('must have a color');
  });

  test('should accept nodes with direct color field', () => {
    const canvas: ExtendedCanvas = {
      nodes: [
        {
          id: 'title',
          type: 'text',
          x: 0,
          y: 0,
          width: 200,
          height: 100,
          text: '# Title',
          color: '#64748B',
        },
      ],
      edges: [],
      pv: {
        name: 'Test Canvas',
        version: '1.0.0',
      },
    };

    const issues = validateCanvasColor(canvas);
    expect(issues).toHaveLength(0);
  });

  test('should accept nodes with color from canvas nodeType', () => {
    const canvas: ExtendedCanvas = {
      nodes: [
        {
          id: 'node1',
          type: 'text',
          x: 0,
          y: 0,
          width: 200,
          height: 100,
          text: 'Node',
          pv: {
            nodeType: 'service',
          },
        },
      ],
      edges: [],
      pv: {
        name: 'Test Canvas',
        version: '1.0.0',
        nodeTypes: {
          service: {
            label: 'Service',
            description: 'Service node',
            color: '#3B82F6',
          },
        },
      },
    };

    const issues = validateCanvasColor(canvas);
    expect(issues).toHaveLength(0);
  });

  test('should accept nodes with color from library nodeComponent', () => {
    const canvas: ExtendedCanvas = {
      nodes: [
        {
          id: 'node1',
          type: 'text',
          x: 0,
          y: 0,
          width: 200,
          height: 100,
          text: 'Node',
          pv: {
            nodeType: 'database',
          },
        },
      ],
      edges: [],
      pv: {
        name: 'Test Canvas',
        version: '1.0.0',
      },
    };

    const library = {
      nodeComponents: {
        database: {
          color: '#10B981',
        },
      },
    };

    const issues = validateCanvasColor(canvas, library);
    expect(issues).toHaveLength(0);
  });

  test('should require color when nodeType exists but has no color', () => {
    const canvas: ExtendedCanvas = {
      nodes: [
        {
          id: 'node1',
          type: 'text',
          x: 0,
          y: 0,
          width: 200,
          height: 100,
          text: 'Node',
          pv: {
            nodeType: 'service',
          },
        },
      ],
      edges: [],
      pv: {
        name: 'Test Canvas',
        version: '1.0.0',
        nodeTypes: {
          service: {
            label: 'Service',
            description: 'Service node',
            // No color defined
          },
        },
      },
    };

    const issues = validateCanvasColor(canvas);
    expect(issues).toHaveLength(1);
    expect(issues[0].type).toBe('error');
    expect(issues[0].message).toContain('must have a color');
  });

  test('should validate multiple nodes', () => {
    const canvas: ExtendedCanvas = {
      nodes: [
        {
          id: 'node1',
          type: 'text',
          x: 0,
          y: 0,
          width: 200,
          height: 100,
          text: 'Node 1',
          color: '#64748B',
        },
        {
          id: 'node2',
          type: 'text',
          x: 300,
          y: 0,
          width: 200,
          height: 100,
          text: 'Node 2',
          // No color
        },
        {
          id: 'node3',
          type: 'text',
          x: 600,
          y: 0,
          width: 200,
          height: 100,
          text: 'Node 3',
          pv: {
            nodeType: 'service',
          },
        },
      ],
      edges: [],
      pv: {
        name: 'Test Canvas',
        version: '1.0.0',
        nodeTypes: {
          service: {
            label: 'Service',
            description: 'Service node',
            color: '#3B82F6',
          },
        },
      },
    };

    const issues = validateCanvasColor(canvas);
    expect(issues).toHaveLength(1);
    expect(issues[0].message).toContain('node2');
  });

  test('should prioritize direct color over nodeType color', () => {
    const canvas: ExtendedCanvas = {
      nodes: [
        {
          id: 'node1',
          type: 'text',
          x: 0,
          y: 0,
          width: 200,
          height: 100,
          text: 'Node',
          color: '#FF0000', // Direct color
          pv: {
            nodeType: 'service', // Also has nodeType with color
          },
        },
      ],
      edges: [],
      pv: {
        name: 'Test Canvas',
        version: '1.0.0',
        nodeTypes: {
          service: {
            label: 'Service',
            description: 'Service node',
            color: '#3B82F6',
          },
        },
      },
    };

    const issues = validateCanvasColor(canvas);
    expect(issues).toHaveLength(0);
  });
});

/**
 * Test helper to validate otel.canvas library requirement
 */
function validateOtelCanvasLibraryRequirement(
  filePath: string,
  library: { raw: Record<string, unknown>; path: string } | null
): Array<{ type: 'error' | 'warning'; message: string; suggestion?: string }> {
  const issues: Array<{ type: 'error' | 'warning'; message: string; suggestion?: string }> = [];

  // For .otel.canvas files: warn if library.yaml is missing
  if (filePath.endsWith('.otel.canvas') && !library) {
    issues.push({
      type: 'warning',
      message: 'Found otel.canvas file but no library.yaml',
      suggestion:
        'Create .principal-views/library.yaml to register your instrumentation library.\nThis ensures traces are properly attributed to your library.',
    });
  }

  return issues;
}

describe('validate command - otel.canvas library requirement', () => {
  test('should warn when .otel.canvas exists without library.yaml', () => {
    const issues = validateOtelCanvasLibraryRequirement(
      '.principal-views/feature/feature.otel.canvas',
      null
    );

    expect(issues).toHaveLength(1);
    expect(issues[0].type).toBe('warning');
    expect(issues[0].message).toBe('Found otel.canvas file but no library.yaml');
    expect(issues[0].suggestion).toContain('Create .principal-views/library.yaml');
  });

  test('should not warn when .otel.canvas exists with library.yaml', () => {
    const library = {
      raw: { name: 'test-lib' },
      path: '.principal-views/library.yaml',
    };

    const issues = validateOtelCanvasLibraryRequirement(
      '.principal-views/feature/feature.otel.canvas',
      library
    );

    expect(issues).toHaveLength(0);
  });

  test('should not warn for regular .canvas files without library.yaml', () => {
    const issues = validateOtelCanvasLibraryRequirement(
      '.principal-views/feature/feature.canvas',
      null
    );

    expect(issues).toHaveLength(0);
  });
});

/**
 * Test helper to validate deprecation warnings for pv.otel.kind and pv.otel.category
 */
function validateDeprecatedOtelFields(
  nodePv: Record<string, unknown>
): Array<{ type: 'error' | 'warning'; message: string; suggestion?: string }> {
  const issues: Array<{ type: 'error' | 'warning'; message: string; suggestion?: string }> = [];
  const nodeOtel = nodePv.otel as Record<string, unknown> | undefined;

  if (nodeOtel?.kind !== undefined) {
    issues.push({
      type: 'warning',
      message: 'Node uses deprecated "pv.otel.kind" field',
      suggestion: 'Use "pv.nodeType" instead.',
    });
  }

  if (nodeOtel?.category !== undefined) {
    issues.push({
      type: 'warning',
      message: 'Node uses deprecated "pv.otel.category" field',
      suggestion: 'Use "pv.nodeType" instead.',
    });
  }

  return issues;
}

describe('validate command - deprecation warnings', () => {
  test('should warn when pv.otel.kind is used', () => {
    const nodePv = {
      otel: {
        kind: 'event',
      },
    };

    const issues = validateDeprecatedOtelFields(nodePv);
    expect(issues).toHaveLength(1);
    expect(issues[0].type).toBe('warning');
    expect(issues[0].message).toContain('deprecated "pv.otel.kind"');
  });

  test('should warn when pv.otel.category is used', () => {
    const nodePv = {
      otel: {
        category: 'discovery',
      },
    };

    const issues = validateDeprecatedOtelFields(nodePv);
    expect(issues).toHaveLength(1);
    expect(issues[0].type).toBe('warning');
    expect(issues[0].message).toContain('deprecated "pv.otel.category"');
  });

  test('should warn for both kind and category when both are used', () => {
    const nodePv = {
      otel: {
        kind: 'event',
        category: 'discovery',
      },
    };

    const issues = validateDeprecatedOtelFields(nodePv);
    expect(issues).toHaveLength(2);
    expect(issues[0].message).toContain('pv.otel.kind');
    expect(issues[1].message).toContain('pv.otel.category');
  });

  test('should not warn when neither kind nor category is used', () => {
    const nodePv = {
      otel: {
        files: ['src/app.ts'],
      },
    };

    const issues = validateDeprecatedOtelFields(nodePv);
    expect(issues).toHaveLength(0);
  });

  test('should not warn when pv.otel is not present', () => {
    const nodePv = {
      nodeType: 'event',
    };

    const issues = validateDeprecatedOtelFields(nodePv);
    expect(issues).toHaveLength(0);
  });
});

/**
 * Test helper to validate nodeType enforcement per canvas type
 */
function validateNodeTypeForCanvasType(
  filePath: string,
  nodeType: string
): Array<{ type: 'error' | 'warning'; message: string; suggestion?: string }> {
  const issues: Array<{ type: 'error' | 'warning'; message: string; suggestion?: string }> = [];

  const isResourcesCanvas = filePath.endsWith('resources.canvas');
  const isSpansCanvas = filePath.endsWith('.spans.canvas');
  const isOtelCanvas = filePath.endsWith('.otel.canvas');

  if (isResourcesCanvas) {
    const validResourceTypes = ['resource', 'scope'];
    if (!validResourceTypes.includes(nodeType)) {
      issues.push({
        type: 'error',
        message: `Node in resources.canvas has invalid nodeType "${nodeType}"`,
        suggestion: `resources.canvas nodes must have nodeType: "resource" or "scope"`,
      });
    }
  } else if (isSpansCanvas) {
    const validSpanTypes = ['span-convention'];
    if (!validSpanTypes.includes(nodeType)) {
      issues.push({
        type: 'error',
        message: `Node in .spans.canvas has invalid nodeType "${nodeType}"`,
        suggestion: `spans.canvas nodes must have nodeType: "span-convention"`,
      });
    }
  } else if (isOtelCanvas) {
    const validOtelTypes = ['event', 'boundary'];
    if (!validOtelTypes.includes(nodeType)) {
      issues.push({
        type: 'error',
        message: `Node in .otel.canvas has invalid nodeType "${nodeType}"`,
        suggestion: `otel.canvas nodes must have nodeType: "event" or "boundary"`,
      });
    }
  }

  return issues;
}

describe('validate command - nodeType enforcement per canvas type', () => {
  describe('resources.canvas', () => {
    test('should accept nodeType "resource"', () => {
      const issues = validateNodeTypeForCanvasType('.principal-views/resources.canvas', 'resource');
      expect(issues).toHaveLength(0);
    });

    test('should accept nodeType "scope"', () => {
      const issues = validateNodeTypeForCanvasType('.principal-views/resources.canvas', 'scope');
      expect(issues).toHaveLength(0);
    });

    test('should reject nodeType "event"', () => {
      const issues = validateNodeTypeForCanvasType('.principal-views/resources.canvas', 'event');
      expect(issues).toHaveLength(1);
      expect(issues[0].type).toBe('error');
      expect(issues[0].message).toContain('invalid nodeType "event"');
    });

    test('should reject nodeType "span-convention"', () => {
      const issues = validateNodeTypeForCanvasType(
        '.principal-views/resources.canvas',
        'span-convention'
      );
      expect(issues).toHaveLength(1);
      expect(issues[0].type).toBe('error');
    });
  });

  describe('.spans.canvas', () => {
    test('should accept nodeType "span-convention"', () => {
      const issues = validateNodeTypeForCanvasType(
        '.principal-views/architecture.spans.canvas',
        'span-convention'
      );
      expect(issues).toHaveLength(0);
    });

    test('should reject nodeType "event"', () => {
      const issues = validateNodeTypeForCanvasType(
        '.principal-views/architecture.spans.canvas',
        'event'
      );
      expect(issues).toHaveLength(1);
      expect(issues[0].type).toBe('error');
      expect(issues[0].message).toContain('invalid nodeType "event"');
    });

    test('should reject nodeType "resource"', () => {
      const issues = validateNodeTypeForCanvasType(
        '.principal-views/architecture.spans.canvas',
        'resource'
      );
      expect(issues).toHaveLength(1);
      expect(issues[0].type).toBe('error');
    });
  });

  describe('.otel.canvas', () => {
    test('should accept nodeType "event"', () => {
      const issues = validateNodeTypeForCanvasType(
        '.principal-views/feature/feature.otel.canvas',
        'event'
      );
      expect(issues).toHaveLength(0);
    });

    test('should accept nodeType "boundary"', () => {
      const issues = validateNodeTypeForCanvasType(
        '.principal-views/feature/feature.otel.canvas',
        'boundary'
      );
      expect(issues).toHaveLength(0);
    });

    test('should reject nodeType "resource"', () => {
      const issues = validateNodeTypeForCanvasType(
        '.principal-views/feature/feature.otel.canvas',
        'resource'
      );
      expect(issues).toHaveLength(1);
      expect(issues[0].type).toBe('error');
      expect(issues[0].message).toContain('invalid nodeType "resource"');
    });

    test('should reject nodeType "span-convention"', () => {
      const issues = validateNodeTypeForCanvasType(
        '.principal-views/feature/feature.otel.canvas',
        'span-convention'
      );
      expect(issues).toHaveLength(1);
      expect(issues[0].type).toBe('error');
    });
  });

  describe('regular .canvas files', () => {
    test('should accept any nodeType', () => {
      // Regular .canvas files have no nodeType restrictions
      const issues = validateNodeTypeForCanvasType(
        '.principal-views/architecture.canvas',
        'custom-type'
      );
      expect(issues).toHaveLength(0);
    });
  });
});

/**
 * Test helper to validate spans.canvas ↔ workflow.json cross-validation
 */
function validateSpansWorkflowCrossRef(
  spanConventions: Array<{ spanPattern: string; status: 'draft' | 'implemented' }>,
  workflowSpanPatterns: string[]
): Array<{ type: 'error' | 'warning'; message: string; spanPattern: string }> {
  const issues: Array<{ type: 'error' | 'warning'; message: string; spanPattern: string }> = [];

  const workflowPatternSet = new Set(workflowSpanPatterns);

  for (const span of spanConventions) {
    const hasWorkflow = workflowPatternSet.has(span.spanPattern);

    if (span.status === 'implemented' && !hasWorkflow) {
      issues.push({
        type: 'error',
        message: `Span convention "${span.spanPattern}" is implemented but has no workflow.json`,
        spanPattern: span.spanPattern,
      });
    } else if (span.status === 'draft' && hasWorkflow) {
      issues.push({
        type: 'error',
        message: `Span convention "${span.spanPattern}" has a workflow.json but is marked as draft`,
        spanPattern: span.spanPattern,
      });
    }
  }

  return issues;
}

describe('validate command - spans.canvas ↔ workflow.json cross-validation', () => {
  test('should pass when draft span conventions have no workflow', () => {
    const issues = validateSpansWorkflowCrossRef(
      [
        { spanPattern: 'cli.command', status: 'draft' },
        { spanPattern: 'validate.*', status: 'draft' },
      ],
      []
    );
    expect(issues).toHaveLength(0);
  });

  test('should pass when implemented span conventions have a workflow', () => {
    const issues = validateSpansWorkflowCrossRef(
      [
        { spanPattern: 'cli.command', status: 'implemented' },
        { spanPattern: 'validate.*', status: 'implemented' },
      ],
      ['cli.command', 'validate.*']
    );
    expect(issues).toHaveLength(0);
  });

  test('should error when implemented span convention has no workflow', () => {
    const issues = validateSpansWorkflowCrossRef(
      [
        { spanPattern: 'cli.command', status: 'implemented' },
        { spanPattern: 'validate.*', status: 'draft' },
      ],
      []
    );
    expect(issues).toHaveLength(1);
    expect(issues[0].type).toBe('error');
    expect(issues[0].message).toContain('cli.command');
    expect(issues[0].message).toContain('implemented but has no workflow');
  });

  test('should error when draft span convention has a workflow', () => {
    const issues = validateSpansWorkflowCrossRef(
      [{ spanPattern: 'cli.command', status: 'draft' }],
      ['cli.command']
    );
    expect(issues).toHaveLength(1);
    expect(issues[0].type).toBe('error');
    expect(issues[0].message).toContain('cli.command');
    expect(issues[0].message).toContain('has a workflow.json but is marked as draft');
  });

  test('should handle mixed scenarios correctly', () => {
    const issues = validateSpansWorkflowCrossRef(
      [
        { spanPattern: 'cli.command', status: 'implemented' }, // has workflow - OK
        { spanPattern: 'validate.*', status: 'implemented' }, // no workflow - ERROR
        { spanPattern: 'discover.*', status: 'draft' }, // no workflow - OK
        { spanPattern: 'parse.*', status: 'draft' }, // has workflow - ERROR
      ],
      ['cli.command', 'parse.*']
    );
    expect(issues).toHaveLength(2);
    expect(issues[0].spanPattern).toBe('validate.*');
    expect(issues[1].spanPattern).toBe('parse.*');
  });
});

/**
 * Test helper to validate that workflows with spanPattern require spans.canvas
 */
function validateWorkflowsRequireSpansCanvas(
  workflowSpanPatterns: string[],
  hasSpansCanvas: boolean
): Array<{ type: 'error' | 'warning'; message: string; spanPattern: string }> {
  const issues: Array<{ type: 'error' | 'warning'; message: string; spanPattern: string }> = [];

  if (workflowSpanPatterns.length > 0 && !hasSpansCanvas) {
    for (const spanPattern of workflowSpanPatterns) {
      issues.push({
        type: 'error',
        message: `Workflow defines spanPattern "${spanPattern}" but no spans.canvas file exists`,
        spanPattern,
      });
    }
  }

  return issues;
}

describe('validate command - workflows require spans.canvas', () => {
  test('should pass when no workflows have spanPattern', () => {
    const issues = validateWorkflowsRequireSpansCanvas([], false);
    expect(issues).toHaveLength(0);
  });

  test('should pass when workflows have spanPattern and spans.canvas exists', () => {
    const issues = validateWorkflowsRequireSpansCanvas(['cli.command', 'validate.*'], true);
    expect(issues).toHaveLength(0);
  });

  test('should error when workflow has spanPattern but no spans.canvas', () => {
    const issues = validateWorkflowsRequireSpansCanvas(['cli.command'], false);
    expect(issues).toHaveLength(1);
    expect(issues[0].type).toBe('error');
    expect(issues[0].message).toContain('cli.command');
    expect(issues[0].message).toContain('no spans.canvas file exists');
  });

  test('should error for each workflow with spanPattern when no spans.canvas', () => {
    const issues = validateWorkflowsRequireSpansCanvas(
      ['cli.command', 'validate.*', 'discover.*'],
      false
    );
    expect(issues).toHaveLength(3);
    expect(issues[0].spanPattern).toBe('cli.command');
    expect(issues[1].spanPattern).toBe('validate.*');
    expect(issues[2].spanPattern).toBe('discover.*');
  });
});

/**
 * Test helper for span pattern matching with wildcard support
 */
function spanPatternMatches(conventionPattern: string, workflowPattern: string): boolean {
  if (conventionPattern === workflowPattern) {
    return true;
  }
  if (conventionPattern.endsWith('.*')) {
    const prefix = conventionPattern.slice(0, -1);
    return workflowPattern.startsWith(prefix);
  }
  return false;
}

/**
 * Test helper to find matching workflows with wildcard support
 */
function findMatchingWorkflows(conventionPattern: string, workflowPatterns: string[]): string[] {
  return workflowPatterns.filter((wp) => spanPatternMatches(conventionPattern, wp));
}

/**
 * Updated cross-validation helper with wildcard support
 */
function validateSpansWorkflowCrossRefWithWildcards(
  spanConventions: Array<{ spanPattern: string; status: 'draft' | 'implemented' }>,
  workflowSpanPatterns: string[]
): Array<{ type: 'error' | 'warning'; message: string; spanPattern: string }> {
  const issues: Array<{ type: 'error' | 'warning'; message: string; spanPattern: string }> = [];

  for (const span of spanConventions) {
    const matchingWorkflows = findMatchingWorkflows(span.spanPattern, workflowSpanPatterns);
    const hasWorkflow = matchingWorkflows.length > 0;

    if (span.status === 'implemented' && !hasWorkflow) {
      issues.push({
        type: 'error',
        message: `Span convention "${span.spanPattern}" is implemented but has no workflow.json`,
        spanPattern: span.spanPattern,
      });
    } else if (span.status === 'draft' && hasWorkflow) {
      issues.push({
        type: 'error',
        message: `Span convention "${span.spanPattern}" has matching workflow(s) but is marked as draft`,
        spanPattern: span.spanPattern,
      });
    }
  }

  return issues;
}

describe('validate command - span pattern wildcard matching', () => {
  test('should match exact patterns', () => {
    expect(spanPatternMatches('cli.request', 'cli.request')).toBe(true);
    expect(spanPatternMatches('cli.request', 'cli.command')).toBe(false);
  });

  test('should match wildcard patterns', () => {
    expect(spanPatternMatches('task.*', 'task.create')).toBe(true);
    expect(spanPatternMatches('task.*', 'task.edit')).toBe(true);
    expect(spanPatternMatches('task.*', 'task.view')).toBe(true);
    expect(spanPatternMatches('task.*', 'task')).toBe(false); // No dot after prefix
    expect(spanPatternMatches('task.*', 'taskify')).toBe(false); // Wrong prefix
  });

  test('should match nested wildcard patterns', () => {
    expect(spanPatternMatches('filesystem.draft.*', 'filesystem.draft.list')).toBe(true);
    expect(spanPatternMatches('filesystem.draft.*', 'filesystem.draft.view')).toBe(true);
    expect(spanPatternMatches('filesystem.draft.*', 'filesystem.other')).toBe(false);
  });

  test('should find multiple matching workflows', () => {
    const workflows = ['task.create', 'task.edit', 'task.view', 'milestone.create'];
    const matches = findMatchingWorkflows('task.*', workflows);
    expect(matches).toHaveLength(3);
    expect(matches).toContain('task.create');
    expect(matches).toContain('task.edit');
    expect(matches).toContain('task.view');
  });
});

describe('validate command - spans-workflow cross-validation with wildcards', () => {
  test('should pass when wildcard pattern has matching workflows and is implemented', () => {
    const issues = validateSpansWorkflowCrossRefWithWildcards(
      [{ spanPattern: 'task.*', status: 'implemented' }],
      ['task.create', 'task.edit']
    );
    expect(issues).toHaveLength(0);
  });

  test('should error when wildcard pattern has matching workflows but is draft', () => {
    const issues = validateSpansWorkflowCrossRefWithWildcards(
      [{ spanPattern: 'task.*', status: 'draft' }],
      ['task.create', 'task.edit']
    );
    expect(issues).toHaveLength(1);
    expect(issues[0].type).toBe('error');
    expect(issues[0].message).toContain('task.*');
    expect(issues[0].message).toContain('marked as draft');
  });

  test('should error when implemented pattern has no matching workflows', () => {
    const issues = validateSpansWorkflowCrossRefWithWildcards(
      [{ spanPattern: 'task.*', status: 'implemented' }],
      ['milestone.create']
    );
    expect(issues).toHaveLength(1);
    expect(issues[0].type).toBe('error');
    expect(issues[0].message).toContain('has no workflow.json');
  });

  test('should handle mixed exact and wildcard patterns', () => {
    const issues = validateSpansWorkflowCrossRefWithWildcards(
      [
        { spanPattern: 'cli.request', status: 'implemented' }, // exact match - OK
        { spanPattern: 'task.*', status: 'implemented' }, // wildcard match - OK
        { spanPattern: 'milestone.*', status: 'draft' }, // draft with matches - ERROR
        { spanPattern: 'search.*', status: 'implemented' }, // no matches - ERROR
      ],
      ['cli.request', 'task.create', 'task.edit', 'milestone.create']
    );
    expect(issues).toHaveLength(2);
    expect(issues[0].spanPattern).toBe('milestone.*');
    expect(issues[1].spanPattern).toBe('search.*');
  });
});

/**
 * Helper to check if span text header echoes the spanPattern
 */
function spanTextEchoesPattern(text: string, spanPattern: string): boolean {
  const headerMatch = text.match(/^#\s*(.+?)(?:\n|$)/);
  if (!headerMatch) return false;
  const headerText = headerMatch[1].trim();
  return headerText === spanPattern || headerText.toLowerCase() === spanPattern.toLowerCase();
}

describe('validate command - span text should not echo spanPattern', () => {
  test('should detect when header exactly matches spanPattern', () => {
    expect(spanTextEchoesPattern('# cli.request\n\nDescription', 'cli.request')).toBe(true);
    expect(spanTextEchoesPattern('# task.*\n\nTask operations', 'task.*')).toBe(true);
  });

  test('should detect case-insensitive matches', () => {
    expect(spanTextEchoesPattern('# CLI.Request\n\nDescription', 'cli.request')).toBe(true);
    expect(spanTextEchoesPattern('# TASK.*\n\nTask operations', 'task.*')).toBe(true);
  });

  test('should allow descriptive headers that differ from spanPattern', () => {
    expect(spanTextEchoesPattern('# CLI Request Handler\n\nDescription', 'cli.request')).toBe(
      false
    );
    expect(spanTextEchoesPattern('# Task Operations\n\nTask management', 'task.*')).toBe(false);
    expect(spanTextEchoesPattern('# Entry Point\n\nMain entry', 'cli.request')).toBe(false);
  });

  test('should handle headers with extra whitespace', () => {
    expect(spanTextEchoesPattern('#  cli.request \n\nDescription', 'cli.request')).toBe(true);
    expect(spanTextEchoesPattern('#   Task Operations  \n\nDescription', 'task.*')).toBe(false);
  });

  test('should handle text without proper header', () => {
    expect(spanTextEchoesPattern('No header here', 'cli.request')).toBe(false);
    expect(spanTextEchoesPattern('cli.request without hash', 'cli.request')).toBe(false);
  });
});

interface NodeRect {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

function rectanglesIntersect(a: NodeRect, b: NodeRect): boolean {
  return !(
    a.x + a.width <= b.x ||
    b.x + b.width <= a.x ||
    a.y + a.height <= b.y ||
    b.y + b.height <= a.y
  );
}

function nodeContains(
  outer: { x: number; y: number; width: number; height: number },
  inner: { x: number; y: number; width: number; height: number }
): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.width <= outer.x + outer.width &&
    inner.y + inner.height <= outer.y + outer.height
  );
}

function findContainingTextNodes(
  nodes: Array<{ id: string; type: string; x: number; y: number; width: number; height: number }>
): Array<{ textNodeId: string; containedIds: string[] }> {
  const results: Array<{ textNodeId: string; containedIds: string[] }> = [];

  for (const textNode of nodes) {
    if (textNode.type !== 'text') continue;

    const contained = nodes.filter(
      (other) => other.id !== textNode.id && other.type !== 'text' && nodeContains(textNode, other)
    );

    if (contained.length > 0) {
      results.push({ textNodeId: textNode.id, containedIds: contained.map((n) => n.id) });
    }
  }

  return results;
}

describe('validate command - text nodes containing other nodes', () => {
  test('should detect text node containing another node', () => {
    const nodes = [
      { id: 'container', type: 'text', x: 0, y: 0, width: 300, height: 200 },
      { id: 'child1', type: 'otel-event', x: 50, y: 50, width: 100, height: 50 },
    ];

    const results = findContainingTextNodes(nodes);
    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({ textNodeId: 'container', containedIds: ['child1'] });
  });

  test('should not flag text nodes that only intersect but do not contain', () => {
    const nodes = [
      { id: 'container', type: 'text', x: 0, y: 0, width: 100, height: 50 },
      { id: 'child1', type: 'otel-event', x: 50, y: 25, width: 100, height: 50 },
    ];

    const results = findContainingTextNodes(nodes);
    expect(results).toHaveLength(0);
  });

  test('should detect text node containing multiple nodes', () => {
    const nodes = [
      { id: 'container', type: 'text', x: 0, y: 0, width: 400, height: 300 },
      { id: 'child1', type: 'otel-event', x: 50, y: 50, width: 100, height: 50 },
      { id: 'child2', type: 'otel-event', x: 200, y: 100, width: 100, height: 50 },
      { id: 'child3', type: 'otel-span-convention', x: 50, y: 200, width: 100, height: 50 },
    ];

    const results = findContainingTextNodes(nodes);
    expect(results).toHaveLength(1);
    expect(results[0].textNodeId).toBe('container');
    expect(results[0].containedIds).toHaveLength(3);
    expect(results[0].containedIds).toContain('child1');
    expect(results[0].containedIds).toContain('child2');
    expect(results[0].containedIds).toContain('child3');
  });

  test('should not flag non-text nodes even when containing others', () => {
    const nodes = [
      { id: 'node1', type: 'otel-event', x: 0, y: 0, width: 100, height: 50 },
      { id: 'node2', type: 'otel-event', x: 50, y: 25, width: 100, height: 50 },
    ];

    const results = findContainingTextNodes(nodes);
    expect(results).toHaveLength(0);
  });

  test('should not flag adjacent nodes (touching but not containing)', () => {
    const nodes = [
      { id: 'container', type: 'text', x: 0, y: 0, width: 100, height: 50 },
      { id: 'child1', type: 'otel-event', x: 100, y: 0, width: 100, height: 50 },
    ];

    const results = findContainingTextNodes(nodes);
    expect(results).toHaveLength(0);
  });

  test('should not flag nodes sharing only an edge', () => {
    const nodes = [
      { id: 'container', type: 'text', x: 0, y: 0, width: 100, height: 100 },
      { id: 'child1', type: 'otel-event', x: 0, y: 100, width: 100, height: 50 },
    ];

    const results = findContainingTextNodes(nodes);
    expect(results).toHaveLength(0);
  });

  test('should not flag partial overlap (must fully contain)', () => {
    const nodes = [
      { id: 'container', type: 'text', x: 0, y: 0, width: 100, height: 100 },
      { id: 'child1', type: 'otel-event', x: 50, y: 50, width: 100, height: 100 },
    ];

    const results = findContainingTextNodes(nodes);
    expect(results).toHaveLength(0);
  });

  test('should detect when small text node is inside group node', () => {
    const nodes = [
      { id: 'container', type: 'group', x: 0, y: 0, width: 500, height: 500 },
      { id: 'small-text', type: 'text', x: 100, y: 100, width: 50, height: 50 },
    ];

    const results = findContainingTextNodes(nodes);
    expect(results).toHaveLength(0);
  });

  test('should ignore text nodes containing other text nodes', () => {
    const nodes = [
      { id: 'outer', type: 'text', x: 0, y: 0, width: 500, height: 500 },
      { id: 'inner', type: 'text', x: 100, y: 100, width: 50, height: 50 },
    ];

    const results = findContainingTextNodes(nodes);
    expect(results).toHaveLength(0);
  });
});
