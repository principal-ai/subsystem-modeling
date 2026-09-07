# Span Attribute Schema Design

This document describes a proposed extension to workflow templates to support span attribute schemas, enabling validation of `{{@span.*}}` template references.

## Problem Statement

Currently, templates can access span attributes via `{{@span.attributeName}}`, but there is no schema to validate these references:

| Attribute Type | Schema Location | Template Syntax | Validated? |
|---------------|-----------------|-----------------|------------|
| Event attributes | `canvas.nodes[].pv.event.attributes` | `{{orderId}}` | Yes (partial) |
| Span attributes | **None** | `{{@span.http.method}}` | **No** |

This creates several issues:

1. **No typo detection** - `{{@span.htttp.method}}` silently renders empty
2. **No documentation** - Span attributes aren't discoverable from the workflow
3. **No unused attribute warnings** - Can't warn when span attributes are captured but never displayed
4. **Inconsistent validation** - Event attributes are validated, span attributes are not

## Key Insight: Workflows Are Spans

Workflows match spans via `spanPattern`:

```json
{
  "name": "Auth Check Workflow",
  "spanPattern": "auth.check",
  "canvas": "auth.otel.canvas"
}
```

The workflow IS the span. Therefore, span attribute schemas belong at the **workflow level**, not the canvas level.

## Proposed Schema

### WorkflowTemplate Extension

```typescript
interface WorkflowTemplate {
  // ... existing fields ...

  /**
   * Schema for span-level attributes accessible via {{@span.*}}
   *
   * Defines attributes on the span that this workflow matches.
   * Used for template validation and documentation.
   */
  spanAttributes?: {
    [attributeName: string]: SpanAttributeSchema;
  };
}

interface SpanAttributeSchema {
  /** Attribute type */
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';

  /** Human-readable description */
  description?: string;

  /** For object types: nested attribute schemas */
  properties?: {
    [key: string]: SpanAttributeSchema;
  };

  /** Example value for documentation */
  example?: unknown;

  /**
   * Semantic convention reference
   * @example "http.request.method" (OTel semantic conventions)
   */
  semconv?: string;
}
```

### Example Usage

```json
{
  "version": "1.0.0",
  "name": "HTTP Request Workflow",
  "spanPattern": "http.request",
  "canvas": "http.otel.canvas",

  "spanAttributes": {
    "http.request.method": {
      "type": "string",
      "description": "HTTP method (GET, POST, etc.)",
      "semconv": "http.request.method",
      "example": "GET"
    },
    "http.response.status_code": {
      "type": "number",
      "description": "HTTP response status code",
      "semconv": "http.response.status_code",
      "example": 200
    },
    "url.path": {
      "type": "string",
      "description": "Request URL path",
      "semconv": "url.path",
      "example": "/api/users"
    },
    "user.id": {
      "type": "string",
      "description": "Authenticated user ID",
      "example": "usr_123"
    }
  },

  "scenarios": [{
    "id": "success",
    "template": {
      "introduction": "{{@span.http.request.method}} {{@span.url.path}}",
      "summary": "Completed with status {{@span.http.response.status_code}}"
    }
  }]
}
```

## Validation Rules

### 1. Template Reference Validation (`workflow-span-attribute-undefined`)

**Severity:** `error`

Validates that `{{@span.*}}` references exist in the span attribute schema.

```
Error: Template references "{{@span.htttp.method}}" but workflow does not
define this span attribute. Available: http.request.method, http.response.status_code
```

### 2. Unused Span Attribute (`workflow-span-attribute-unused`)

**Severity:** `warning`

Warns when a span attribute is defined but never used in templates.

```
Warning: Span attribute "user.id" is defined but not used in any template.
Use {{@span.user.id}} in a template, or remove the attribute if it's not needed.
```

### 3. Runtime Validation (`workflow-span-attribute-missing`)

**Severity:** `warning` (with execution data)

Validates that expected span attributes are present in actual telemetry.

```
Warning: Span attribute "user.id" is defined in schema but not found in
execution data. Check instrumentation.
```

## Relationship to Event Attributes

| Aspect | Event Attributes | Span Attributes |
|--------|-----------------|-----------------|
| Schema Location | Canvas node (`pv.event.attributes`) | Workflow (`spanAttributes`) |
| Template Syntax | `{{attributeName}}` | `{{@span.attributeName}}` |
| Scope | Per-event | Per-span (workflow-wide) |
| Source | `span.events[].attributes` | `span.attributes` |
| Semantic Conventions | Custom | Often OTel semconv |

### Why Different Locations?

- **Event attributes** are defined per-node in canvas because different events have different schemas
- **Span attributes** are defined at workflow level because the workflow IS the span

## Semantic Convention Support

The `semconv` field allows referencing OpenTelemetry semantic conventions:

```json
{
  "http.request.method": {
    "type": "string",
    "semconv": "http.request.method"
  }
}
```

Future enhancements could:
- Auto-populate type/description from semconv registry
- Validate semconv attribute names
- Generate documentation links

## Migration Path

This is a non-breaking addition:

1. **Phase 1:** Add `spanAttributes` as optional field (no validation)
2. **Phase 2:** Add validation rules (opt-in via config flag)
3. **Phase 3:** Enable validation by default, warn on missing schemas

## Implementation Tasks

- [ ] Add `spanAttributes` to `WorkflowTemplate` type
- [ ] Update JSON schema for workflow files
- [ ] Implement `workflow-span-attribute-undefined` validation rule
- [ ] Implement `workflow-span-attribute-unused` validation rule
- [ ] Update template parser to extract `@span.*` references for validation
- [ ] Add runtime validation against execution data
- [ ] Update CLI to display span attribute info
- [ ] Document in workflow authoring guide

## Open Questions

1. **Should we support nested object access?**
   - Template: `{{@span.http.request.headers.content-type}}`
   - Schema: nested `properties` or flat with dot notation?

2. **Should we auto-detect from execution files?**
   - Scan `.otel.json` files to suggest span attribute schemas
   - Risk: captures noise attributes

3. **How to handle inherited attributes?**
   - Parent span attributes available via `@span` namespace?
   - Need separate schema for parent vs current span?

4. **Severity levels?**
   - Missing schema: error or warning?
   - Undefined reference: error or warning?

## Related

- [WORKFLOW_VALIDATION.md](./WORKFLOW_VALIDATION.md) - Event validation rules
- [OpenTelemetry Semantic Conventions](https://opentelemetry.io/docs/specs/semconv/)
