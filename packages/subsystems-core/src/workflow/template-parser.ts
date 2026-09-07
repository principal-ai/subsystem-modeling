/**
 * Template Parser using Handlebars
 *
 * Parses and evaluates template expressions using Handlebars syntax:
 * - Variables: {{variable}}
 * - Nested properties: {{result.violations.total}}
 * - Conditionals: {{#if condition}}...{{/if}}
 * - Loops: {{#each items}}...{{/each}}
 * - Comparison helpers: {{#if (eq a b)}}...{{/if}}
 */

import Handlebars from 'handlebars';

/**
 * Template context for variable resolution
 * Represents dynamic data passed to template rendering with support for nested object traversal
 */
export type TemplateContext = {
  [key: string]: TemplateValue;
};

/**
 * Valid values within a template context
 * Can be primitives, nested objects, or arrays
 */
export type TemplateValue = string | number | boolean | null | undefined | TemplateContext | TemplateValue[];

// Register common comparison helpers
Handlebars.registerHelper('eq', (a, b) => a === b);
Handlebars.registerHelper('ne', (a, b) => a !== b);
Handlebars.registerHelper('lt', (a, b) => a < b);
Handlebars.registerHelper('gt', (a, b) => a > b);
Handlebars.registerHelper('lte', (a, b) => a <= b);
Handlebars.registerHelper('gte', (a, b) => a >= b);
Handlebars.registerHelper('and', (...args) => {
  // Last argument is Handlebars options object
  const values = args.slice(0, -1);
  return values.every(Boolean);
});
Handlebars.registerHelper('or', (...args) => {
  // Last argument is Handlebars options object
  const values = args.slice(0, -1);
  return values.some(Boolean);
});
Handlebars.registerHelper('not', (a) => !a);

/**
 * Represents a segment in a parsed template
 */
export interface TemplateSegment {
  /** Segment type: text (static) or variable (dynamic) */
  type: 'text' | 'variable';
  /** The rendered value (interpolated for variables, raw for text) */
  value: string;
  /** Original template variable name (e.g., "customer.name"), only for variables */
  variableName?: string;
  /** Whether the variable had data in the context, only for variables */
  resolved?: boolean;
}

/**
 * Structured representation of a parsed template with metadata about variables
 */
export class ParsedTemplate {
  constructor(public readonly segments: TemplateSegment[]) {}

  /**
   * Convert to flat string for backwards compatibility
   */
  toString(): string {
    return this.segments.map((seg) => seg.value).join('');
  }
}

/**
 * Extract variable references from a Handlebars AST node
 */
function extractVariables(node: hbs.AST.Node, variables: Set<string> = new Set()): Set<string> {
  if (node.type === 'MustacheStatement' || node.type === 'SubExpression') {
    const mustache = node as hbs.AST.MustacheStatement | hbs.AST.SubExpression;
    if (mustache.path.type === 'PathExpression') {
      const pathExpr = mustache.path as hbs.AST.PathExpression;
      // Track simple variable references (not helpers)
      // Include both regular variables and @data variables (e.g., @span)
      if (!mustache.params?.length) {
        variables.add(pathExpr.original);
      }
    }
    // Process parameters (they might contain variables)
    if (mustache.params) {
      mustache.params.forEach((param) => extractVariables(param, variables));
    }
  } else if (node.type === 'PathExpression') {
    const pathExpr = node as hbs.AST.PathExpression;
    // Include both regular variables and @data variables (e.g., @span)
    variables.add(pathExpr.original);
  } else if (node.type === 'BlockStatement') {
    const block = node as hbs.AST.BlockStatement;
    if (block.program) {
      extractVariables(block.program, variables);
    }
    if (block.inverse) {
      extractVariables(block.inverse, variables);
    }
    // Process block parameters
    if (block.params) {
      block.params.forEach((param) => extractVariables(param, variables));
    }
  } else if (node.type === 'Program') {
    const program = node as hbs.AST.Program;
    program.body.forEach((child) => extractVariables(child, variables));
  } else if (node.type === 'PartialStatement') {
    const partial = node as hbs.AST.PartialStatement;
    if (partial.params) {
      partial.params.forEach((param) => extractVariables(param, variables));
    }
  }

  return variables;
}

/**
 * Resolve a variable path in a context object
 * Returns [value, resolved] where resolved indicates if the path exists
 *
 * @param path - Variable path (e.g., "user.name" or "@span.output.status")
 * @param context - Data context for regular variables
 * @param data - Data context for @-prefixed variables (e.g., @span)
 */
function resolveVariable(path: string, context: TemplateContext, data?: TemplateData): [TemplateValue, boolean] {
  let parts = path.split('.');
  let current: TemplateValue;

  // Handle @data variables (e.g., @span.output.status)
  if (path.startsWith('@') && data) {
    // Remove @ prefix from first part
    parts[0] = parts[0].substring(1);
    current = data as unknown as TemplateContext;
  } else {
    current = context;
  }

  for (const part of parts) {
    if (current == null || typeof current !== 'object' || Array.isArray(current)) {
      return [undefined, false];
    }
    if (!(part in current)) {
      return [undefined, false];
    }
    current = current[part];
  }

  return [current, true];
}

/**
 * Build segments from rendered output by identifying variable boundaries
 */
function buildSegments(
  template: string,
  rendered: string,
  context: Record<string, unknown>,
  data?: TemplateData
): TemplateSegment[] {
  const segments: TemplateSegment[] = [];

  // Find all {{variable}} patterns in the rendered output (these are unresolved)
  const unresolvedPattern = /\{\{([^}]+)\}\}/g;
  const unresolvedMatches = Array.from(rendered.matchAll(unresolvedPattern));

  if (unresolvedMatches.length === 0) {
    // No unresolved variables, check if we have any variables at all
    try {
      const ast = Handlebars.parse(template);
      const variables = extractVariables(ast);

      if (variables.size === 0) {
        // Pure text template
        return [{ type: 'text', value: rendered }];
      }

      // All variables resolved - need to parse more carefully
      // This is complex, so for MVP we'll use a simpler heuristic:
      // Split by variable positions in the template and match to rendered output
      return buildSegmentsWithResolvedVariables(template, rendered, context, variables, data);
    } catch {
      // If parsing fails, return as text
      return [{ type: 'text', value: rendered }];
    }
  }

  // Build segments with unresolved variables
  let lastIndex = 0;

  for (const match of unresolvedMatches) {
    const beforeText = rendered.substring(lastIndex, match.index);
    if (beforeText) {
      segments.push({ type: 'text', value: beforeText });
    }

    segments.push({
      type: 'variable',
      value: match[0],
      variableName: match[1].trim(),
      resolved: false,
    });

    lastIndex = match.index! + match[0].length;
  }

  // Add remaining text
  if (lastIndex < rendered.length) {
    segments.push({ type: 'text', value: rendered.substring(lastIndex) });
  }

  return segments;
}

/**
 * Build segments when all variables are resolved
 *
 * Strategy: Process template sequentially, tracking positions in both
 * template and rendered strings. The text before each variable is the same
 * in both (it's literal text), so we can use it to stay synchronized.
 */
function buildSegmentsWithResolvedVariables(
  template: string,
  rendered: string,
  context: Record<string, unknown>,
  variables: Set<string>,
  data?: TemplateData
): TemplateSegment[] {
  const segments: TemplateSegment[] = [];

  // Find all variable positions in the template
  const varPattern = /\{\{([^}]+)\}\}/g;
  const templateMatches = Array.from(template.matchAll(varPattern));

  if (templateMatches.length === 0) {
    return [{ type: 'text', value: rendered }];
  }

  let templateIndex = 0;

  for (const match of templateMatches) {
    const varName = match[1].trim();

    // Check if this is a helper or a simple variable
    const isHelper = varName.startsWith('#') ||
                     varName.startsWith('/') ||
                     varName.startsWith('^') ||
                     varName.startsWith('>') ||
                     !variables.has(varName);

    if (isHelper) {
      continue; // Skip helpers for now
    }

    // The text before this variable in the template
    const textBefore = template.substring(templateIndex, match.index);

    // This same text should appear in the rendered output at renderedIndex
    // (literal text doesn't change during template rendering)
    if (textBefore) {
      segments.push({ type: 'text', value: textBefore });
    }

    // Resolve the variable to get its rendered value
    const [value, resolved] = resolveVariable(varName, context as TemplateContext, data);

    // Treat empty strings as unresolved - they provide no useful display value
    // and indicate missing/unset data that should be visible to the user
    const hasValue = resolved && value !== undefined && value !== '';

    if (hasValue) {
      const valueStr = String(value);
      segments.push({
        type: 'variable',
        value: valueStr,
        variableName: varName,
        resolved: true,
      });
    } else {
      // Unresolved - should appear as {{varName}} in output
      const unresolvedStr = `{{${varName}}}`;
      segments.push({
        type: 'variable',
        value: unresolvedStr,
        variableName: varName,
        resolved: false,
      });
    }

    templateIndex = match.index! + match[0].length;
  }

  // Add remaining text after the last variable
  const remainingTemplate = template.substring(templateIndex);
  if (remainingTemplate) {
    segments.push({ type: 'text', value: remainingTemplate });
  }

  return segments;
}

/**
 * Data variables accessible via @ prefix in templates
 *
 * These are Handlebars "data" variables, accessed with @ prefix:
 * - {{@span.attributeName}} - Parent span's attributes
 */
export interface TemplateData {
  /** Parent span's attributes (flattened for dot-notation access) */
  span?: Record<string, unknown>;
}

/**
 * Parse and evaluate a template string using Handlebars
 *
 * @param template - Template string with {{variables}}
 * @param context - Data context for variable lookup
 * @param data - Optional data variables accessible via @ prefix (e.g., @span)
 * @returns ParsedTemplate with structured segments and variable metadata
 *
 * @example
 * // Access event attributes directly
 * parseTemplate("Count: {{tasks.count}}", { tasks: { count: 5 } })
 *
 * // Access span attributes via @span
 * parseTemplate("Status: {{@span.output.status}}", context, { span: { output: { status: "ok" } } })
 */
export function parseTemplate(template: string, context: TemplateContext, data?: TemplateData): ParsedTemplate {
  try {
    const handlebarTemplate = Handlebars.compile(template, { noEscape: true });
    const rendered = handlebarTemplate(context, { data });

    // Build structured segments
    const segments = buildSegments(template, rendered, context, data);

    return new ParsedTemplate(segments);
  } catch (error) {
    // Return error as a single text segment
    return new ParsedTemplate([
      {
        type: 'text',
        value: `{ERROR: Template parsing failed - ${error instanceof Error ? error.message : 'unknown'}}`,
      },
    ]);
  }
}
