# Principal View CLI

A command-line tool for validating and managing `.canvas` configuration files for the Principal View Framework.

## Installation

```bash
npm install -g @principal-ai/principal-studio-cli
```

## Usage

After installation, use the `principal-ai` command:

```bash
principal-ai --help
```

Or run without installing via npx:

```bash
npx @principal-ai/principal-studio-cli --help
```

### Commands

#### `init` - Initialize Project Structure

Set up a new `.principal-views` folder with template files:

```bash
principal-ai init
principal-ai init --name my-architecture
principal-ai init --force  # Overwrite existing files
```

#### `validate` - Validate Canvas Files

Strict validation of `.canvas` configuration files:

```bash
principal-ai validate                    # Validates all .principal-views/*.canvas files
principal-ai validate path/to/file.canvas
principal-ai validate "**/*.canvas"      # Glob pattern
principal-ai validate --quiet            # Only output errors
principal-ai validate --json             # Output as JSON
```

**Validation checks:**

- Required `pv` extension with name and version
- All nodes have required fields (id, type, x, y, width, height)
- Custom node types must have `pv.nodeType` and valid `pv.shape`
- Edge references point to existing nodes
- Edge types reference defined edge type definitions

#### `list` (alias: `ls`) - List Canvas Files

Display all canvas files in the project with metadata:

```bash
principal-ai list
principal-ai ls --all     # Search all directories
principal-ai ls --json    # Output as JSON
```

#### `schema` - Display Format Documentation

Show detailed documentation about the canvas format:

```bash
principal-ai schema              # Overview
principal-ai schema nodes        # Node types, shapes, colors
principal-ai schema edges        # Edge properties and styles
principal-ai schema pv           # Principal View extension fields
principal-ai schema examples     # Complete examples
```

#### `doctor` - Configuration Health Check

Check configuration staleness and validate source patterns:

```bash
principal-ai doctor
principal-ai doctor --quiet        # Only show errors and warnings
principal-ai doctor --errors-only  # For pre-commit hooks
principal-ai doctor --json         # Output as JSON
```

## Canvas Format

Canvas files follow the [JSON Canvas](https://jsoncanvas.org/) specification with Principal View extensions that maintain compatibility with standard tools like Obsidian.

### Required Structure

```json
{
  "nodes": [...],
  "edges": [...],
  "pv": {
    "name": "my-architecture",
    "version": "1.0.0"
  }
}
```

### Node Types

**Standard types** (no additional metadata required):

- `text` - Text content
- `group` - Container for other nodes
- `file` - File reference
- `link` - URL link

**Custom types** require `pv` extension:

```json
{
  "id": "node-1",
  "type": "custom",
  "x": 0,
  "y": 0,
  "width": 200,
  "height": 100,
  "pv": {
    "nodeType": "service",
    "shape": "rectangle"
  }
}
```

**Available shapes:** `circle`, `rectangle`, `hexagon`, `diamond`, `custom`

### Edge Types

Define reusable edge styles at the canvas level:

```json
{
  "pv": {
    "edgeTypes": {
      "data-flow": {
        "style": "dashed",
        "color": "#3498db",
        "width": 2
      }
    }
  }
}
```

Use in edges:

```json
{
  "id": "edge-1",
  "fromNode": "node-1",
  "toNode": "node-2",
  "pv": {
    "edgeType": "data-flow"
  }
}
```

## Requirements

- Node.js >= 18

## License

Apache-2.0
