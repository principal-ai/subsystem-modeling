# Scopes Architecture Migration

**Status**: Ready for Implementation
**Created**: 2026-04-20
**Type**: Breaking Change

## Problem Statement

### Important: Two Different "Scopes" Concepts

This migration is specifically about **scope visual metadata** (colors, icons, descriptions). It does **NOT** affect the `owned-scopes` field in resources, which is used for **telemetry routing and registry lookup**.

**What's NOT Changing:**
- `resources.*.owned-scopes` arrays in library.yaml - These declare which instrumentation scopes belong to each service for registry routing
- The telemetry routing mechanism that uses owned-scopes to map incoming OTLP traces to the correct workspace/library

**What IS Changing:**
- Top-level `scopes:` section in library.yaml - Visual metadata for those scope names

#### Background: Owned Scopes for Registry Routing

The `owned-scopes` field in resources is critical for telemetry routing:

```yaml
resources:
  my-service:
    service.name: "my-service"
    owned-scopes:
      - "@my-org/my-library"    # This service owns this instrumentation scope
```

When OTLP traces arrive with scope `@my-org/my-library`, the LocalRegistry uses `owned-scopes` to route them to the correct workspace/library that has the matching workflows and storyboards.

This is separate from visual styling - owned-scopes is about **which service owns which instrumentation scopes**, while the top-level scopes section (being migrated) was about **how to visually render those scopes**.

**References:**
- `docs/LOCAL_DEVELOPMENT_REGISTRY.md` - Registry routing design
- `docs/LIBRARY_TELEMETRY_AND_MATCHING.md` - Scope-based telemetry matching
- `docs/guides/configuring-telemetry-routing.md` - Practical routing configuration

---

Currently, scope **visual metadata** exists in **two separate places**, creating redundancy and confusion:

1. **`library.yaml` → `scopes:` section** - Defines scope colors/icons/descriptions for event node rendering
2. **`.scopes.canvas`** - Architectural diagram showing scope nodes as visual elements

This dual representation creates several issues:

### Issues with Current Architecture

1. **Data Duplication**: Scope names and colors defined in both places
2. **Maintenance Burden**: When adding a scope, must update both `library.yaml` and `.scopes.canvas`
3. **Inconsistency Risk**: Colors can drift between the two sources
4. **Unclear Source of Truth**: Which file owns the scope definition?
5. **Validation Complexity**: CLI must validate both files are in sync

### Example of Current Duplication

**library.yaml**:
```yaml
scopes:
  auth-service:
    color: "#3B82F6"
    description: "Authentication service scope"
  payment-service:
    color: "#10B981"
    description: "Payment service scope"
```

**architecture.scopes.canvas**:
```json
{
  "nodes": [
    {
      "id": "auth-scope",
      "type": "otel-scope",
      "label": "Authentication Service",
      "otel": { "scope": "auth-service" }
    },
    {
      "id": "payment-scope",
      "type": "otel-scope",
      "label": "Payment Service",
      "otel": { "scope": "payment-service" }
    }
  ]
}
```

**Problem**: Scope name and metadata duplicated across two files!

---

## Proposed Architecture

**Single Source of Truth for Visual Metadata**: `.scopes.canvas` file

All scope **visual metadata** (colors, descriptions, icons) lives in the `.scopes.canvas` file as node properties. The `library.yaml` file no longer contains a top-level `scopes:` section.

**Important**: The `owned-scopes` field in resources remains in library.yaml - it serves a different purpose (telemetry routing/registry lookup).

### New Structure

**architecture.scopes.canvas** (source of truth):
```json
{
  "name": "Instrumentation Scopes",
  "description": "Defines instrumentation scopes for the application",
  "nodes": [
    {
      "id": "auth-scope",
      "type": "otel-scope",
      "label": "Authentication Service",
      "color": "#3B82F6",
      "description": "Handles user authentication and session management",
      "otel": {
        "scope": "auth-service"
      },
      "data": {
        "icon": "shield"
      }
    },
    {
      "id": "payment-scope",
      "type": "otel-scope",
      "label": "Payment Service",
      "color": "#10B981",
      "description": "Processes payments and transactions",
      "otel": {
        "scope": "payment-service"
      },
      "data": {
        "icon": "credit-card"
      }
    }
  ]
}
```

**library.yaml** (no top-level scopes section):
```yaml
version: "1.0.0"
name: "My Library"

# Resources still have owned-scopes for registry routing
resources:
  my-service:
    service.name: "my-service"
    owned-scopes:
      - auth-service      # Registry: this service owns "auth-service" scope
      - payment-service   # Registry: this service owns "payment-service" scope

eventSchemas:
  # ... event schema definitions (optional)
```

**Note**: `owned-scopes` arrays remain in resources - they're used for telemetry routing, not visual metadata.

### Benefits

1. **Single Source of Truth**: Scope visual metadata lives in one place
2. **Separation of Concerns**: Registry/routing config (`owned-scopes`) in library.yaml, visual config in .scopes.canvas
3. **Visual First**: Scopes are architectural elements, naturally belong in canvas
4. **Richer Metadata**: Can include visual position, relationships, groupings
5. **Simpler Validation**: Only validate that `owned-scopes` references exist in `.scopes.canvas`
6. **Better UX**: Edit scope colors directly in the canvas visual editor
7. **Clearer Architecture**: `owned-scopes` declares ownership for routing; .scopes.canvas provides documentation and styling

---

## Current Implementation Details

### Where `library.yaml` → `scopes:` is Used

#### 1. Core Library - Scope Color Mapping

**File**: `packages/subsystems-core/src/scopes/utils.ts:94-106`

```typescript
export function buildScopeColorMap(
  library: { scopes?: Record<string, ScopeDefinition> } | undefined
): Record<string, string> {
  const colorMap: Record<string, string> = {};

  if (library?.scopes) {
    for (const [name, def] of Object.entries(library.scopes)) {
      colorMap[name] = def.color ?? DEFAULT_SCOPE_COLOR;
    }
  }

  return colorMap;
}
```

**Purpose**: Creates `{ "auth-service": "#3B82F6", ... }` map for fast color lookups
**Used by**: `GraphRenderer` to color event nodes based on `otel.scope` field

#### 2. React - GraphRenderer Color Injection

**File**: `packages/subsystems-react/src/components/GraphRenderer.tsx:2584`

```typescript
const scopeColorMap = buildScopeColorMap(library);

for (const node of nodes) {
  const scope = node.data?.otel?.scope;
  if (scope) {
    node.data.scopeColor = scopeColorMap[scope] ?? DRAFT_NODE_COLOR;
  }
}
```

**Purpose**: Injects `scopeColor` into node data for rendering
**Result**: Event nodes get colored based on their scope

#### 3. CLI - Scope Validation

**File**: `packages/principal-studio-cli/src/commands/validate.ts:1495-1506`

```typescript
if (library && library.scopes) {
  if (!library.scopes[scope]) {
    const availableScopes = Object.keys(library.scopes);
    issues.push({
      level: 'error',
      message: `Scope "${scope}" is not defined in library.yaml. Available scopes: ${availableScopes.join(', ')}`
    });
  }
}
```

**Purpose**: Validates that `otel.scope` values in canvas nodes exist in `library.scopes`
**Error**: Prevents typos and undefined scope references

#### 4. CLI - Library Schema Validation

**File**: `packages/principal-studio-cli/src/commands/validate.ts:355-366`

```typescript
if (lib.scopes && typeof lib.scopes === 'object') {
  for (const [scopeId, scopeDef] of Object.entries(lib.scopes)) {
    const scope = scopeDef as Record<string, unknown>;

    // Check for unknown fields
    checkUnknownFields(scope, ALLOWED_LIBRARY_FIELDS.scope, `scopes.${scopeId}`, issues);

    // Validate icon names are valid Lucide icons
    if (scope.icon) {
      validateIconName(scope.icon, `scopes.${scopeId}.icon`, issues);
    }
  }
}
```

**Purpose**: Schema validation for scope definitions
**Checks**: Unknown fields, valid icon names

#### 5. Discovery - Scopes Canvas Requirement

**File**: `packages/subsystems-core/src/discovery/LibraryDiscovery.ts:299-338`

```typescript
private async validateScopesCanvasRequirement(
  packagePath: string,
  servicesWithScopes: ServiceWithScopes[],
  libraryPath: string,
  errors: LibraryValidationError[]
): Promise<void> {
  const hasOwnedScopes = servicesWithScopes.some(s => s.ownedScopes.length > 0);
  if (!hasOwnedScopes) return;

  const scopesCanvasExists = await this.checkScopesCanvasExists(pvDir);

  if (!scopesCanvasExists) {
    errors.push({
      message: `Scopes canvas required: library.yaml defines owned-scopes but no .scopes.canvas file found`,
      type: 'scopes-canvas-required'
    });
  }
}
```

**Purpose**: Ensures `.scopes.canvas` exists when `owned-scopes` is defined
**Validates**: Scopes are documented in canvas files

#### 6. Panels - Legend Display

**File**: `industry-themed-principal-view-panels/src/panels/CanvasEditorPanel.tsx:1836-1895`

```typescript
{state.library?.scopes && Object.keys(state.library.scopes).length > 0 && (
  <div>
    <span>Scopes:</span>
    {Object.entries(state.library.scopes).map(([scopeName, scopeConfig]) => (
      <div key={scopeName}>
        <div
          style={{ backgroundColor: scopeConfig.color }}
          onClick={(e) => openColorPicker(scopeName, e)}
        />
        <span>{scopeName}</span>
      </div>
    ))}
  </div>
)}
```

**Purpose**: Displays scope colors in legend with interactive color picker
**Feature**: Click to edit scope colors (saves to `library.yaml`)

---

## Migration Implementation

### Approach: Breaking Change with Clear Errors

**Goal**: Clean breaking change with helpful error messages and migration tooling

No backward compatibility - the top-level `scopes:` section will immediately cause a validation error with clear instructions on how to migrate.

#### Core Library Changes

**1. Canvas-based Color Map Builder**

```typescript
// packages/subsystems-core/src/scopes/utils.ts

/**
 * Build scope color map from .scopes.canvas nodes
 * Reads color from node.color or node.data?.color
 */
export function buildScopeColorMapFromCanvas(
  scopesCanvas: ExtendedCanvas | undefined
): Record<string, string> {
  const colorMap: Record<string, string> = {};

  if (!scopesCanvas?.nodes) return colorMap;

  for (const node of scopesCanvas.nodes) {
    // Only process otel-scope nodes
    if (node.type !== 'otel-scope') continue;

    const scopeName = node.otel?.scope;
    if (!scopeName) continue;

    // Get color from node.color or node.data.color
    const color = node.color || node.data?.color;
    if (color) {
      colorMap[scopeName] = color;
    }
  }

  return colorMap;
}
```

**2. Update Existing Builder to Use Canvas Only**

```typescript
// packages/subsystems-core/src/scopes/utils.ts

/**
 * Build scope color map from .scopes.canvas
 * No fallback - library.scopes is no longer supported
 */
export function buildScopeColorMap(
  scopesCanvas: ExtendedCanvas | undefined
): Record<string, string> {
  return buildScopeColorMapFromCanvas(scopesCanvas);
}
```

#### React Changes

**Update GraphRenderer to require scopesCanvas**

```typescript
// packages/subsystems-react/src/components/GraphRenderer.tsx

function useCanvasToLegacy(
  canvas: ExtendedCanvas | undefined,
  library?: ComponentLibrary,
  spansCanvas?: ExtendedCanvas,
  scopesCanvas?: ExtendedCanvas  // NEW parameter
) {
  // Build scope color map from canvas only
  const scopeColorMap = buildScopeColorMap(scopesCanvas);

  // Rest of implementation unchanged
}
```

#### CLI Changes

**1. Add Migration Command**

```bash
pv migrate scopes-to-canvas
```

```typescript
// packages/principal-studio-cli/src/commands/migrate-scopes-to-canvas.ts

export async function migrateScopesToCanvas() {
  // 1. Read library.yaml
  const library = await loadLibrary();

  if (!library.scopes || Object.keys(library.scopes).length === 0) {
    console.log('✓ No scopes section found in library.yaml - nothing to migrate');
    return;
  }

  // 2. Check if .scopes.canvas already exists
  const scopesCanvasPath = findScopesCanvas();
  let scopesCanvas: ExtendedCanvas;

  if (scopesCanvasPath) {
    // Load existing canvas
    scopesCanvas = await loadCanvas(scopesCanvasPath);
  } else {
    // Create new canvas
    scopesCanvas = {
      name: 'Instrumentation Scopes',
      description: 'Defines instrumentation scopes for the application',
      nodes: [],
      edges: []
    };
  }

  // 3. Convert library.scopes to canvas nodes
  let x = 0;
  for (const [scopeName, scopeDef] of Object.entries(library.scopes)) {
    // Check if node already exists
    const existingNode = scopesCanvas.nodes.find(
      n => n.otel?.scope === scopeName
    );

    if (!existingNode) {
      scopesCanvas.nodes.push({
        id: `${scopeName}-scope`,
        type: 'otel-scope',
        label: scopeDef.description || scopeName,
        color: scopeDef.color,
        description: scopeDef.description,
        x,
        y: 0,
        width: 200,
        height: 80,
        otel: {
          scope: scopeName
        },
        data: scopeDef.icon ? { icon: scopeDef.icon } : undefined
      });
      x += 250; // Space nodes horizontally
    }
  }

  // 4. Save updated canvas
  const outputPath = scopesCanvasPath || '.principal-views/architecture.scopes.canvas';
  await saveCanvas(outputPath, scopesCanvas);

  // 5. Show next steps
  console.log(`
✓ Migrated ${Object.keys(library.scopes).length} scopes to ${outputPath}

⚠️  NEXT STEPS:
1. Review the generated .scopes.canvas file
2. Remove the 'scopes:' section from library.yaml
3. Run 'pv validate' to verify the migration
  `);
}
```

**2. Add Error for library.scopes**

```typescript
// packages/principal-studio-cli/src/commands/validate.ts

// Check for unsupported scopes section
if (lib.scopes && typeof lib.scopes === 'object') {
  issues.push({
    level: 'error',
    message: `The 'scopes' section in library.yaml is no longer supported. Run 'pv migrate scopes-to-canvas' to migrate to .scopes.canvas format.`,
    path: libraryPath,
    suggestion: 'Run: pv migrate scopes-to-canvas'
  });
}
```

**3. Update Scope Reference Validation**

```typescript
// packages/principal-studio-cli/src/commands/validate.ts

async function validateScopeReferences(
  canvas: ExtendedCanvas,
  scopesCanvas: ExtendedCanvas | undefined
) {
  for (const node of canvas.nodes) {
    const scope = node.otel?.scope;
    if (!scope) continue;

    // Get available scopes from .scopes.canvas only
    const availableScopes = scopesCanvas?.nodes
      .filter(n => n.type === 'otel-scope' && n.otel?.scope)
      .map(n => n.otel!.scope) ?? [];

    // Validate scope exists
    if (availableScopes.length > 0 && !availableScopes.includes(scope)) {
      issues.push({
        level: 'error',
        nodeId: node.id,
        message: `Scope "${scope}" not found. Available scopes: ${availableScopes.join(', ')}`,
        suggestion: `Add a node with type="otel-scope" and otel.scope="${scope}" to your .scopes.canvas file`
      });
    }
  }
}
```

#### Panels Changes

**Update Legend to Use Canvas Only**

```typescript
// industry-themed-principal-view-panels/src/panels/CanvasEditorPanel.tsx

// Load scopes canvas
const [scopesCanvas, setScopesCanvas] = useState<ExtendedCanvas | null>(null);

useEffect(() => {
  // Load .scopes.canvas if it exists
  const loadScopesCanvas = async () => {
    const scopesPath = findScopesCanvasPath(fileTree);
    if (scopesPath) {
      const content = await readFile(scopesPath);
      setScopesCanvas(ConfigLoader.parseCanvas(content));
    }
  };
  loadScopesCanvas();
}, [fileTree]);

// Build scope color map from canvas
const scopeColors = useMemo(() => {
  const colors: Record<string, string> = {};

  if (scopesCanvas?.nodes) {
    for (const node of scopesCanvas.nodes) {
      if (node.type === 'otel-scope' && node.otel?.scope) {
        colors[node.otel.scope] = node.color || '#64748b';
      }
    }
  }

  return colors;
}, [scopesCanvas]);

// Render legend
{Object.keys(scopeColors).length > 0 && (
  <div>
    <span>Scopes:</span>
    {Object.entries(scopeColors).map(([scopeName, color]) => (
      <div key={scopeName}>
        <div
          style={{ backgroundColor: color }}
          onClick={(e) => openColorPicker(scopeName, e)}
        />
        <span>{scopeName}</span>
      </div>
    ))}
  </div>
)}
```

**Update Color Picker to Edit Canvas**

```typescript
const handleScopeColorChange = async (scopeName: string, newColor: string) => {
  if (!scopesCanvas) {
    console.error('No scopes canvas loaded');
    return;
  }

  // Edit .scopes.canvas node color
  const updatedCanvas = {
    ...scopesCanvas,
    nodes: scopesCanvas.nodes.map(node =>
      node.otel?.scope === scopeName
        ? { ...node, color: newColor }
        : node
    )
  };

  // Save canvas
  await actions.writeFile(scopesCanvasPath, JSON.stringify(updatedCanvas, null, 2));
  setScopesCanvas(updatedCanvas);
};
```

---

## Implementation Checklist

#### Core Library (`@principal-ai/subsystems-core`)

- [ ] Add `buildScopeColorMapFromCanvas()` function
- [ ] Update `buildScopeColorMap()` to only use `scopesCanvas` parameter
- [ ] Remove `scopes` field from `ComponentLibrary` interface
- [ ] Update type exports
- [ ] Write unit tests for canvas-based color mapping
- [ ] Update existing tests to pass `scopesCanvas`

#### React (`@principal-ai/subsystems-react`)

- [ ] Add `scopesCanvas` prop to `GraphRenderer`
- [ ] Update `useCanvasToLegacy` to accept `scopesCanvas`
- [ ] Pass `scopesCanvas` to `buildScopeColorMap`
- [ ] Update PropTypes/TypeScript types
- [ ] Update Storybook examples

#### CLI (`@principal-ai/principal-studio-cli`)

- [ ] Create `migrate-scopes-to-canvas` command
- [ ] Add error for `scopes` in library.yaml to `validate` command
- [ ] Update scope validation to use .scopes.canvas only
- [ ] Update help text and documentation

#### Panels (`industry-themed-principal-view-panels`)

- [ ] Load `.scopes.canvas` file in `CanvasEditorPanel`
- [ ] Build scope colors from canvas only
- [ ] Update color picker to edit canvas
- [ ] Update stories to use `.scopes.canvas`

---

## Testing Strategy

### Unit Tests

```typescript
// packages/subsystems-core/src/scopes/__tests__/utils.test.ts

describe('buildScopeColorMapFromCanvas', () => {
  it('extracts colors from otel-scope nodes', () => {
    const canvas: ExtendedCanvas = {
      nodes: [
        {
          id: 'auth',
          type: 'otel-scope',
          color: '#3B82F6',
          otel: { scope: 'auth-service' }
        },
        {
          id: 'payment',
          type: 'otel-scope',
          color: '#10B981',
          otel: { scope: 'payment-service' }
        }
      ],
      edges: []
    };

    const colorMap = buildScopeColorMapFromCanvas(canvas);

    expect(colorMap).toEqual({
      'auth-service': '#3B82F6',
      'payment-service': '#10B981'
    });
  });

  it('ignores non-otel-scope nodes', () => {
    const canvas: ExtendedCanvas = {
      nodes: [
        { id: 'regular', type: 'rectangle', color: '#FF0000' },
        { id: 'auth', type: 'otel-scope', color: '#3B82F6', otel: { scope: 'auth' } }
      ],
      edges: []
    };

    const colorMap = buildScopeColorMapFromCanvas(canvas);

    expect(colorMap).toEqual({ 'auth': '#3B82F6' });
  });

  it('uses default color when node has no color', () => {
    const canvas: ExtendedCanvas = {
      nodes: [
        { id: 'auth', type: 'otel-scope', otel: { scope: 'auth' } }
      ],
      edges: []
    };

    const colorMap = buildScopeColorMapFromCanvas(canvas);

    expect(colorMap).toEqual({});
  });
});

describe('buildScopeColorMap', () => {
  it('builds color map from scopesCanvas', () => {
    const scopesCanvas: ExtendedCanvas = {
      nodes: [
        { id: 'auth', type: 'otel-scope', color: '#3B82F6', otel: { scope: 'auth' } }
      ],
      edges: []
    };

    const colorMap = buildScopeColorMap(scopesCanvas);

    expect(colorMap['auth']).toBe('#3B82F6');
  });

  it('returns empty map when no canvas provided', () => {
    const colorMap = buildScopeColorMap(undefined);

    expect(colorMap).toEqual({});
  });
});
```

### Integration Tests

```typescript
// packages/subsystems-react/src/__tests__/GraphRenderer.scopes.test.tsx

describe('GraphRenderer with scopesCanvas', () => {
  it('colors nodes using scopesCanvas', () => {
    const canvas = {
      nodes: [
        { id: 'login', type: 'event', otel: { scope: 'auth' } }
      ]
    };

    const scopesCanvas = {
      nodes: [
        { id: 'auth', type: 'otel-scope', color: '#3B82F6', otel: { scope: 'auth' } }
      ]
    };

    render(<GraphRenderer canvas={canvas} scopesCanvas={scopesCanvas} />);

    // Verify node has correct background color
    const node = screen.getByTestId('node-login');
    expect(node).toHaveStyle({ backgroundColor: '#3B82F6' });
  });
});
```

### CLI Tests

```typescript
// packages/principal-studio-cli/src/commands/__tests__/migrate-scopes.test.ts

describe('migrate scopes-to-canvas', () => {
  it('creates .scopes.canvas from library.scopes', async () => {
    // Setup: library.yaml with scopes
    const library = `
version: "1.0"
scopes:
  auth:
    color: "#3B82F6"
    description: "Auth scope"
`;

    await fs.writeFile('library.yaml', library);

    // Run migration
    await migrateScopesToCanvas();

    // Verify: .scopes.canvas created
    const scopesCanvas = JSON.parse(
      await fs.readFile('.principal-views/architecture.scopes.canvas', 'utf-8')
    );

    expect(scopesCanvas.nodes).toHaveLength(1);
    expect(scopesCanvas.nodes[0]).toMatchObject({
      type: 'otel-scope',
      color: '#3B82F6',
      otel: { scope: 'auth' }
    });
  });
});
```

---

## Migration Examples

### Example 1: Simple Migration

**Before (library.yaml)**:
```yaml
version: "1.0"
name: "My App"

scopes:
  auth:
    color: "#3B82F6"
    description: "Authentication"
  payments:
    color: "#10B981"
    description: "Payment processing"

resources:
  my-service:
    service.name: "my-service"
    owned-scopes:
      - auth
      - payments
```

**After**:

**library.yaml**:
```yaml
version: "1.0"
name: "My App"

# owned-scopes REMAINS - used for registry routing
resources:
  my-service:
    service.name: "my-service"
    owned-scopes:
      - auth        # Routes "auth" scope traces to this service
      - payments    # Routes "payments" scope traces to this service
```

**.principal-views/architecture.scopes.canvas**:
```json
{
  "name": "Instrumentation Scopes",
  "description": "OTEL instrumentation scopes for my-service",
  "nodes": [
    {
      "id": "auth-scope",
      "type": "otel-scope",
      "label": "Authentication",
      "color": "#3B82F6",
      "description": "Authentication",
      "x": 0,
      "y": 0,
      "width": 200,
      "height": 80,
      "otel": {
        "scope": "auth"
      }
    },
    {
      "id": "payments-scope",
      "type": "otel-scope",
      "label": "Payment Processing",
      "color": "#10B981",
      "description": "Payment processing",
      "x": 250,
      "y": 0,
      "width": 200,
      "height": 80,
      "otel": {
        "scope": "payments"
      }
    }
  ],
  "edges": []
}
```

### Example 2: Code Usage Update

**Before**:
```typescript
// Only library needed
<GraphRenderer
  canvas={canvas}
  library={library}
/>
```

**After**:
```typescript
// Load scopes canvas
const scopesCanvas = await loadCanvas('.principal-views/architecture.scopes.canvas');

// Pass to renderer
<GraphRenderer
  canvas={canvas}
  library={library}
  scopesCanvas={scopesCanvas}  // NEW - required for scope colors
/>
```

---

## FAQ

### Q: Why not keep both for flexibility?

**A**: Maintaining two sources of truth creates:
- Synchronization bugs
- Confusing developer experience
- Higher maintenance burden
- More complex validation

The `.scopes.canvas` approach is strictly superior as it:
- Provides visual context
- Supports richer metadata
- Allows visual editing
- Is more maintainable

### Q: What happens to existing projects?

**A**: This is a breaking change. Projects using the top-level `scopes:` section will get a validation error with clear instructions.

Migration is simple: `pv migrate scopes-to-canvas`

The migration command will:
1. Read the existing `scopes:` section from library.yaml
2. Generate a .scopes.canvas file with equivalent nodes
3. Provide instructions to remove the old section

### Q: Can I still use library.yaml for other config?

**A**: Yes! Only the top-level `scopes:` section is being removed. All other sections remain:
- `resources` - Service definitions with owned-scopes (used for registry routing)
- `eventSchemas` - Reusable event schema definitions

The `owned-scopes` field in resources is **NOT** being removed - it serves a different purpose than the top-level scopes section.

### Q: What's the difference between `owned-scopes` and the `scopes:` section?

**A**: These serve different purposes:

- **`owned-scopes` (in resources)**: Registry routing configuration
  - Declares which instrumentation scopes this service owns
  - Used by LocalRegistry to map incoming OTLP traces to the correct workspace
  - Example: When a trace arrives with scope `@my-org/my-library`, route it to this workspace
  - **NOT being removed** - critical for telemetry routing

- **`scopes:` (top-level section)**: Visual metadata
  - Defines colors, icons, and descriptions for scope nodes in canvases
  - Used for rendering event nodes with scope-specific colors
  - **BEING MIGRATED** to .scopes.canvas for better organization

### Q: What if I don't want a visual canvas?

**A**: The `.scopes.canvas` file is primarily a **data structure**, not just a visual diagram. You don't need to display it visually. It's simply a better storage format than YAML for scope metadata because:
- JSON is easier to parse and manipulate
- Nodes naturally represent scopes (vs nested YAML objects)
- Can include positions for future visual editing
- Consistent with other canvas files

---

## References

- [EVENTS_CANVAS_SUPPORT.md](../../docs/EVENTS_CANVAS_SUPPORT.md) - Events canvas architecture
- [WORKFLOW_VALIDATION.md](./WORKFLOW_VALIDATION.md) - Workflow validation
- [Library TypeScript Types](../src/types/library.ts) - ComponentLibrary interface
- [Scopes Utilities](../src/scopes/utils.ts) - Current implementation
