/**
 * Schema command - Display documentation about the canvas format
 */

import { Command } from 'commander';
import chalk from 'chalk';

const SCHEMA_SECTIONS = {
  overview: `
${chalk.bold.cyan('Principal View Canvas Schema')}
${chalk.dim('═'.repeat(50))}

Canvas files (.canvas) follow the JSON Canvas spec with Principal View extensions.
All PV extensions are placed in a ${chalk.yellow('"pv"')} field to maintain compatibility
with standard canvas tools like Obsidian.

${chalk.bold('Required Structure:')}
${chalk.dim('┌─────────────────────────────────────────────────┐')}
${chalk.dim('│')} {                                               ${chalk.dim('│')}
${chalk.dim('│')}   ${chalk.green('"nodes"')}: [...],    ${chalk.dim(
    '// Required: array of nodes'
  )}  ${chalk.dim('│')}
${chalk.dim('│')}   ${chalk.green('"edges"')}: [...],    ${chalk.dim(
    '// Optional: array of edges'
  )}  ${chalk.dim('│')}
${chalk.dim('│')}   ${chalk.green('"pv"')}: {            ${chalk.dim(
    '// Required: PV extension'
  )}    ${chalk.dim('│')}
${chalk.dim('│')}     ${chalk.yellow('"name"')}: "...",   ${chalk.dim(
    '// Required: graph name'
  )}      ${chalk.dim('│')}
${chalk.dim('│')}     ${chalk.yellow('"version"')}: "..." ${chalk.dim(
    '// Required: schema version'
  )}  ${chalk.dim('│')}
${chalk.dim('│')}   }                                             ${chalk.dim('│')}
${chalk.dim('│')} }                                               ${chalk.dim('│')}
${chalk.dim('└─────────────────────────────────────────────────┘')}

Run ${chalk.cyan('npx @principal-ai/principal-studio-cli schema <section>')} for details on:
  ${chalk.yellow('nodes')}      Node types and properties
  ${chalk.yellow('edges')}      Edge properties and types
  ${chalk.yellow('pv')}         Principal View extension fields
  ${chalk.yellow('examples')}   Complete example configurations
`,

  nodes: `
${chalk.bold.cyan('Node Schema')}
${chalk.dim('═'.repeat(50))}

${chalk.bold('Required Fields (all nodes):')}
  ${chalk.green('id')}        ${chalk.dim('string')}   Unique identifier
  ${chalk.green('type')}      ${chalk.dim('string')}   Node type (see below)
  ${chalk.green('x')}         ${chalk.dim('number')}   X position in pixels
  ${chalk.green('y')}         ${chalk.dim('number')}   Y position in pixels
  ${chalk.green('width')}     ${chalk.dim('number')}   Width in pixels
  ${chalk.green('height')}    ${chalk.dim('number')}   Height in pixels

${chalk.bold('Optional Fields:')}
  ${chalk.green('color')}     ${chalk.dim('string|number')}   Hex color or preset (1-6)

${chalk.bold('Standard Node Types:')}
  ${chalk.yellow('text')}      Text/markdown content node
              Requires: ${chalk.dim('text')} (string)

  ${chalk.yellow('group')}     Visual container for other nodes
              Optional: ${chalk.dim('label')}, ${chalk.dim('background')}, ${chalk.dim(
    'backgroundStyle'
  )}

  ${chalk.yellow('file')}      Reference to external file
              Requires: ${chalk.dim('file')} (path string)
              Optional: ${chalk.dim('subpath')}

  ${chalk.yellow('link')}      URL reference
              Requires: ${chalk.dim('url')} (string)

${chalk.bold('Custom Node Types:')}
  Any type not in the standard list requires a ${chalk.yellow('vv')} extension:

  ${chalk.dim('{')}
    ${chalk.green('"id"')}: "my-node",
    ${chalk.green('"type"')}: "api-gateway",  ${chalk.dim('// Custom type')}
    ${chalk.green('"x"')}: 100, ${chalk.green('"y"')}: 100,
    ${chalk.green('"width"')}: 150, ${chalk.green('"height"')}: 80,
    ${chalk.green('"color"')}: "#3b82f6",     ${chalk.dim('// Required: hex color')}
    ${chalk.green('"pv"')}: {
      ${chalk.yellow('"nodeType"')}: "api-gateway",  ${chalk.dim('// Required')}
      ${chalk.yellow('"shape"')}: "rectangle",       ${chalk.dim('// Required')}
      ${chalk.cyan('"fill"')}: "#3b82f6",           ${chalk.dim('// Optional: fill color')}
      ${chalk.cyan('"stroke"')}: "#1d4ed8",         ${chalk.dim('// Optional: border color')}
      ${chalk.cyan('"icon"')}: "Server",            ${chalk.dim('// Optional: Lucide icon')}
      ${chalk.cyan('"references"')}: ["src/api/**"] ${chalk.dim('// Optional: file patterns')}
    }
  ${chalk.dim('}')}

${chalk.bold('Valid Shapes:')}
  ${chalk.cyan('circle')}      Circular node
  ${chalk.cyan('rectangle')}   Rectangular node (default)
  ${chalk.cyan('hexagon')}     Hexagonal node
  ${chalk.cyan('diamond')}     Diamond/rhombus node
  ${chalk.cyan('custom')}      Custom SVG shape

${chalk.bold('Boundary Nodes (for external interfaces):')}
  Use ${chalk.yellow('nodeType: "boundary"')} for nodes representing external system interfaces.
  Boundaries define interaction points where control crosses system edges.

  ${chalk.dim('{')}
    ${chalk.green('"id"')}: "host-callback",
    ${chalk.green('"type"')}: "text",
    ${chalk.green('"text"')}: "# Host: onBatchLayoutInitialized\\nPersists layout",
    ${chalk.green('"pv"')}: {
      ${chalk.yellow('"nodeType"')}: "boundary",
      ${chalk.yellow('"boundary"')}: {
        ${chalk.cyan('"direction"')}: "outbound",   ${chalk.dim('// outbound or inbound')}
        ${chalk.cyan('"node"')}: {                  ${chalk.dim('// Node query for cross-repo resolution')}
          ${chalk.cyan('"pv.event.name"')}: "host.batch-layout-initialized",
          ${chalk.cyan('"pv.event.namespace"')}: "collection-host"
        }
      }
    }
  ${chalk.dim('}')}

${chalk.bold('Boundary Direction:')}
  ${chalk.cyan('outbound')}    This system calls out to external system
  ${chalk.cyan('inbound')}     External system calls into this system

${chalk.bold('Color Presets:')}
  ${chalk.red('1')} = red    ${chalk.hex('#f97316')('2')} = orange    ${chalk.yellow('3')} = yellow
  ${chalk.green('4')} = green  ${chalk.cyan('5')} = cyan      ${chalk.hex('#8b5cf6')('6')} = purple
`,

  edges: `
${chalk.bold.cyan('Edge Schema')}
${chalk.dim('═'.repeat(50))}

${chalk.bold('Required Fields:')}
  ${chalk.green('id')}          ${chalk.dim('string')}   Unique identifier
  ${chalk.green('fromNode')}    ${chalk.dim('string')}   Source node ID
  ${chalk.green('toNode')}      ${chalk.dim('string')}   Target node ID
  ${chalk.green('fromSide')}    ${chalk.dim('string')}   Side of source: top, right, bottom, left
  ${chalk.green('toSide')}      ${chalk.dim('string')}   Side of target: top, right, bottom, left

${chalk.bold('Optional Fields:')}
  ${chalk.green('fromEnd')}     ${chalk.dim('string')}   Source endpoint: none, arrow
  ${chalk.green('toEnd')}       ${chalk.dim('string')}   Target endpoint: none, arrow (default)
  ${chalk.green('color')}       ${chalk.dim('string')}   Edge color (hex or preset)
  ${chalk.green('label')}       ${chalk.dim('string')}   Edge label text

${chalk.bold('PV Edge Extension:')}
  ${chalk.dim('{')}
    ${chalk.green('"id"')}: "edge-1",
    ${chalk.green('"fromNode"')}: "api", ${chalk.green('"toNode"')}: "db",
    ${chalk.green('"fromSide"')}: "right", ${chalk.green('"toSide"')}: "left",
    ${chalk.green('"pv"')}: {
      ${chalk.yellow('"edgeType"')}: "query"  ${chalk.dim('// Must be defined in pv.edgeTypes')}
    }
  ${chalk.dim('}')}

${chalk.bold('Defining Edge Types (in canvas vv):')}
  ${chalk.dim('{')}
    ${chalk.green('"pv"')}: {
      "name": "My Graph",
      "version": "1.0.0",
      ${chalk.yellow('"edgeTypes"')}: {
        "query": {
          ${chalk.cyan('"style"')}: "solid",       ${chalk.dim(
    '// solid, dashed, dotted, animated'
  )}
          ${chalk.cyan('"color"')}: "#64748b",     ${chalk.dim('// Hex color')}
          ${chalk.cyan('"width"')}: 2,             ${chalk.dim('// Line width in pixels')}
          ${chalk.cyan('"directed"')}: true,       ${chalk.dim('// Show arrow')}
          ${chalk.cyan('"animation"')}: {          ${chalk.dim('// Optional animation')}
            "type": "flow",       ${chalk.dim('// flow, pulse, particle, glow')}
            "duration": 1000      ${chalk.dim('// Duration in ms')}
          }
        },
        "event": {
          "style": "dashed",
          "color": "#f59e0b"
        },
        "host-call": {           ${chalk.dim('// For boundary node connections')}
          "style": "solid",
          "color": "#06b6d4",    ${chalk.dim('// Cyan for host/external calls')}
          "width": 2,
          "label": "calls host"
        }
      }
    }
  ${chalk.dim('}')}

${chalk.bold('Edge Styles:')}
  ${chalk.cyan('solid')}       Solid line
  ${chalk.cyan('dashed')}      Dashed line
  ${chalk.cyan('dotted')}      Dotted line
  ${chalk.cyan('animated')}    Animated flowing line

${chalk.bold('Animation Types:')}
  ${chalk.cyan('flow')}        Flowing dots along the edge
  ${chalk.cyan('pulse')}       Pulsing glow effect
  ${chalk.cyan('particle')}    Particle stream
  ${chalk.cyan('glow')}        Static glow effect
`,

  pv: `
${chalk.bold.cyan('Principal View Extension')}
${chalk.dim('═'.repeat(50))}

The ${chalk.yellow('pv')} extension adds rich visualization capabilities while
maintaining compatibility with standard JSON Canvas tools.

${chalk.bold('Canvas-Level pv (Required):')}
  ${chalk.dim('{')}
    ${chalk.green('"pv"')}: {
      ${chalk.yellow('"name"')}: "My Architecture",     ${chalk.dim('// Required: Display name')}
      ${chalk.yellow('"version"')}: "1.0.0",            ${chalk.dim('// Required: Schema version')}
      ${chalk.cyan('"description"')}: "...",           ${chalk.dim('// Optional: Description')}
      ${chalk.cyan('"edgeTypes"')}: {...},             ${chalk.dim('// Optional: Edge type defs')}
      ${chalk.cyan('"pathConfig"')}: {...},            ${chalk.dim('// Optional: Path matching')}
      ${chalk.cyan('"display"')}: {...}                ${chalk.dim('// Optional: Display settings')}
    }
  ${chalk.dim('}')}

${chalk.bold('Node-Level pv (for custom types):')}
  ${chalk.dim('{')}
    ${chalk.green('"pv"')}: {
      ${chalk.yellow('"nodeType"')}: "service",        ${chalk.dim('// Required: Type identifier')}
      ${chalk.yellow('"shape"')}: "rectangle",         ${chalk.dim('// Required: Visual shape')}
      ${chalk.cyan('"fill"')}: "#3b82f6",             ${chalk.dim('// Optional: Fill color (hex)')}
      ${chalk.cyan('"stroke"')}: "#1d4ed8",           ${chalk.dim(
    '// Optional: Border color (hex)'
  )}
      ${chalk.cyan('"icon"')}: "Server",              ${chalk.dim('// Optional: Lucide icon name')}
      ${chalk.cyan('"references"')}: ["src/**/*.ts"], ${chalk.dim('// Optional: Source patterns')}
      ${chalk.cyan('"states"')}: {                    ${chalk.dim('// Optional: State definitions')}
        "active": { "color": "#22c55e" },
        "error": { "color": "#ef4444" }
      },
      ${chalk.cyan('"actions"')}: [{                  ${chalk.dim('// Optional: Action patterns')}
        "pattern": "request.*",
        "event": "request",
        "state": "active"
      }]
    }
  ${chalk.dim('}')}

${chalk.bold('Edge-Level pv:')}
  ${chalk.dim('{')}
    ${chalk.green('"pv"')}: {
      ${chalk.yellow('"edgeType"')}: "query",          ${chalk.dim('// References pv.edgeTypes')}
      ${chalk.cyan('"style"')}: "solid",              ${chalk.dim('// Override: line style')}
      ${chalk.cyan('"width"')}: 2,                    ${chalk.dim('// Override: line width')}
      ${chalk.cyan('"animation"')}: {...}             ${chalk.dim('// Override: animation')}
    }
  ${chalk.dim('}')}

${chalk.bold('Path Configuration (pv.pathConfig):')}
  ${chalk.cyan('"pathConfig"')}: {
    "projectRoot": "./",          ${chalk.dim('// Project root path')}
    "captureSource": true,        ${chalk.dim('// Capture source locations')}
    "enableActionPatterns": true, ${chalk.dim('// Enable action matching')}
    "logLevel": "info",           ${chalk.dim('// Minimum log level')}
    "ignoreUnsourced": false      ${chalk.dim('// Ignore logs without source')}
  }

${chalk.bold('Display Configuration (pv.display):')}
  ${chalk.cyan('"display"')}: {
    "layout": "manual",           ${chalk.dim('// manual, hierarchical, force-directed')}
    "theme": {
      "primary": "#3b82f6",
      "success": "#22c55e",
      "warning": "#f59e0b",
      "danger": "#ef4444"
    },
    "animations": {
      "enabled": true,
      "speed": 1.0
    }
  }
`,

  examples: `
${chalk.bold.cyan('Example Configurations')}
${chalk.dim('═'.repeat(50))}

${chalk.bold('Minimal Valid Canvas:')}
${chalk.dim('─'.repeat(50))}
{
  "nodes": [
    {
      "id": "node-1",
      "type": "text",
      "x": 100, "y": 100,
      "width": 150, "height": 80,
      "text": "Hello World"
    }
  ],
  "edges": [],
  "pv": {
    "name": "My Graph",
    "version": "1.0.0"
  }
}

${chalk.bold('Service Architecture:')}
${chalk.dim('─'.repeat(50))}
{
  "nodes": [
    {
      "id": "api",
      "type": "text",
      "x": 100, "y": 100,
      "width": 150, "height": 80,
      "text": "API Gateway",
      "pv": {
        "nodeType": "service",
        "shape": "rectangle",
        "fill": "#3b82f6",
        "stroke": "#1d4ed8",
        "icon": "Server",
        "references": ["src/api/**/*.ts"]
      }
    },
    {
      "id": "db",
      "type": "text",
      "x": 350, "y": 100,
      "width": 150, "height": 80,
      "text": "Database",
      "pv": {
        "nodeType": "database",
        "shape": "hexagon",
        "fill": "#8b5cf6",
        "stroke": "#6d28d9",
        "icon": "Database"
      }
    }
  ],
  "edges": [
    {
      "id": "api-to-db",
      "fromNode": "api",
      "toNode": "db",
      "fromSide": "right",
      "toSide": "left",
      "pv": { "edgeType": "query" }
    }
  ],
  "pv": {
    "name": "Service Architecture",
    "version": "1.0.0",
    "edgeTypes": {
      "query": {
        "style": "solid",
        "color": "#64748b",
        "width": 2,
        "animation": {
          "type": "flow",
          "duration": 1500
        }
      }
    }
  }
}

${chalk.bold('Run validation:')} ${chalk.cyan('npx @principal-ai/principal-studio-cli validate <file>')}
${chalk.bold('Initialize project:')} ${chalk.cyan('npx @principal-ai/principal-studio-cli init')}
`,
};

export function createSchemaCommand(): Command {
  const command = new Command('schema');

  command
    .description('Display documentation about the canvas schema')
    .argument('[section]', 'Section to display: overview, nodes, edges, pv, examples')
    .action((section?: string) => {
      const validSections = Object.keys(SCHEMA_SECTIONS);

      if (!section) {
        console.log(SCHEMA_SECTIONS.overview);
        return;
      }

      const normalizedSection = section.toLowerCase();

      if (!validSections.includes(normalizedSection)) {
        console.log(chalk.red(`Unknown section: ${section}`));
        console.log(`Valid sections: ${validSections.join(', ')}`);
        process.exit(1);
      }

      console.log(SCHEMA_SECTIONS[normalizedSection as keyof typeof SCHEMA_SECTIONS]);
    });

  return command;
}
