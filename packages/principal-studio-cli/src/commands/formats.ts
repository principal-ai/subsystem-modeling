/**
 * Formats command - Display documentation about file formats
 */

import { Command } from 'commander';
import chalk from 'chalk';

const FORMAT_SECTIONS = {
  overview: `
${chalk.bold.cyan('Principal View OTEL File Formats')}
${chalk.dim('═'.repeat(70))}

The Principal View OTEL workflow uses three main file types:

${chalk.bold('1. Canvas Files')} ${chalk.yellow('.otel.canvas')}
   Define OTEL event schemas and telemetry structure for a feature.
   These are the single source of truth for what events should be emitted.

${chalk.bold('2. Workflow Files')} ${chalk.yellow('.workflow.json')}
   Define scenarios and templates for rendering executions as human-readable
   workflows based on the emitted events.

${chalk.bold('3. Execution Files')} ${chalk.yellow('.otel.json')}
   Captured OTEL spans from test runs or production code, exported for
   visualization and validation against canvas schemas.

${chalk.bold('4. Library Files')} ${chalk.yellow('library.yaml')}
   Define service registry and component libraries for the project.
   Documents OTEL resource attributes and service metadata.

${chalk.bold('5. Scopes Canvas')} ${chalk.yellow('.scopes.canvas')}
   Document instrumentation scope boundaries. Validates that all scopes
   declared in library.yaml owned-scopes are properly documented.

${chalk.bold('6. Spans Canvas')} ${chalk.yellow('.spans.canvas')}
   Define span conventions (operation types) and their colors for visualization.
   Span colors are used as fill colors for events emitted within that span.

Run ${chalk.cyan('npx @principal-ai/principal-studio-cli formats <section>')} for details on:
  ${chalk.yellow('canvas')}       .otel.canvas format and event schemas
  ${chalk.yellow('workflow')}     .workflow.json format and scenario structure
  ${chalk.yellow('execution')}    .otel.json format for captured spans
  ${chalk.yellow('library')}      library.yaml format and service registry
  ${chalk.yellow('scopes')}       .scopes.canvas format and scope boundaries
  ${chalk.yellow('spans')}        .spans.canvas format and span conventions
  ${chalk.yellow('colors')}       Color contract for renderers (scope→border, span→fill)
  ${chalk.yellow('examples')}     Complete example files
`,

  canvas: `
${chalk.bold.cyan('Canvas Format (.otel.canvas)')}
${chalk.dim('═'.repeat(70))}

Canvas files define the OTEL event schemas for a feature. They document what
events should be emitted and what attributes each event must/may contain.

${chalk.bold('File Location:')}
  ${chalk.dim('.principal-views/')}${chalk.yellow('<feature-name>.otel.canvas')}

${chalk.bold('Required Structure:')}
${chalk.dim('┌────────────────────────────────────────────────────────────────────┐')}
${chalk.dim('│')} {                                                                  ${chalk.dim('│')}
${chalk.dim('│')}   ${chalk.green('"nodes"')}: [                  ${chalk.dim('// Array of event schemas')}      ${chalk.dim('│')}
${chalk.dim('│')}     {                                                              ${chalk.dim('│')}
${chalk.dim('│')}       ${chalk.yellow('"id"')}: "event-id",      ${chalk.dim('// Unique identifier')}         ${chalk.dim('│')}
${chalk.dim('│')}       ${chalk.green('"type"')}: "otel-event",   ${chalk.dim('// Semantic OTEL node type')}    ${chalk.dim('│')}
${chalk.dim('│')}       ${chalk.green('"label"')}: "Event Name",  ${chalk.dim('// Display label')}              ${chalk.dim('│')}
${chalk.dim('│')}       ${chalk.yellow('"x"')}: 0, ${chalk.yellow('"y"')}: 0, ${chalk.yellow('"width"')}: 200, ${chalk.yellow('"height"')}: 100,                   ${chalk.dim('│')}
${chalk.dim('│')}       ${chalk.dim('// color: NOT required - derived from scope + span at render time')}   ${chalk.dim('│')}
${chalk.dim('│')}       ${chalk.green('"event"')}: {              ${chalk.dim('// Event schema (top-level)')}   ${chalk.dim('│')}
${chalk.dim('│')}         ${chalk.yellow('"name"')}: "feature.event.name",                           ${chalk.dim('│')}
${chalk.dim('│')}         ${chalk.yellow('"attributes"')}: {      ${chalk.dim('// Attribute definitions')}      ${chalk.dim('│')}
${chalk.dim('│')}           "attr.name": {                                             ${chalk.dim('│')}
${chalk.dim('│')}             ${chalk.green('"type"')}: "string",                                    ${chalk.dim('│')}
${chalk.dim('│')}             ${chalk.green('"description"')}: "What this attribute is",           ${chalk.dim('│')}
${chalk.dim('│')}             ${chalk.green('"required"')}: true                                     ${chalk.dim('│')}
${chalk.dim('│')}           }                                                          ${chalk.dim('│')}
${chalk.dim('│')}         }                                                            ${chalk.dim('│')}
${chalk.dim('│')}       },                                                             ${chalk.dim('│')}
${chalk.dim('│')}       ${chalk.green('"otel"')}: {               ${chalk.dim('// OTEL metadata (top-level)')}  ${chalk.dim('│')}
${chalk.dim('│')}         ${chalk.cyan('"status"')}: "draft",     ${chalk.dim('// Required: draft|approved|implemented')} ${chalk.dim('│')}
${chalk.dim('│')}         ${chalk.cyan('"scope"')}: "my-scope",   ${chalk.dim('// Instrumentation scope')}      ${chalk.dim('│')}
${chalk.dim('│')}         ${chalk.cyan('"files"')}: ["src/file.ts"]  ${chalk.dim('// Source files')}            ${chalk.dim('│')}
${chalk.dim('│')}       }                                                              ${chalk.dim('│')}
${chalk.dim('│')}     }                                                                ${chalk.dim('│')}
${chalk.dim('│')}   ],                                                                 ${chalk.dim('│')}
${chalk.dim('│')}   ${chalk.green('"edges"')}: [],                ${chalk.dim('// Optional: event relationships')} ${chalk.dim('│')}
${chalk.dim('│')}   ${chalk.green('"pv"')}: {                                                          ${chalk.dim('│')}
${chalk.dim('│')}     ${chalk.yellow('"name"')}: "Feature Name",  ${chalk.dim('// Feature name (NOT "...Canvas")')} ${chalk.dim('│')}
${chalk.dim('│')}     ${chalk.yellow('"version"')}: "1.0.0",                                           ${chalk.dim('│')}
${chalk.dim('│')}     ${chalk.yellow('"markdown"')}: ".principal-views/feature.md"  ${chalk.dim('// Required: docs')} ${chalk.dim('│')}
${chalk.dim('│')}   }                                                                    ${chalk.dim('│')}
${chalk.dim('│')} }                                                                      ${chalk.dim('│')}
${chalk.dim('└────────────────────────────────────────────────────────────────────┘')}

${chalk.bold('Semantic Node Types for .otel.canvas:')}

  ${chalk.green('otel-event')}            Event schema definition
  ${chalk.green('otel-span-convention')}  Span convention (operation type)
  ${chalk.green('otel-scope')}            Instrumentation scope
  ${chalk.green('otel-resource')}         Resource definition
  ${chalk.green('otel-boundary')}         Boundary marker

${chalk.bold('Node Required Fields:')}

  ${chalk.green('type')}         ${chalk.dim('string')}   "otel-event" (semantic node type)
  ${chalk.green('label')}        ${chalk.dim('string')}   Human-readable display name
  ${chalk.green('event')}        ${chalk.dim('object')}   Event schema with name and attributes (top-level)
  ${chalk.green('otel.status')}  ${chalk.dim('string')}   "draft" | "approved" | "implemented"

${chalk.bold('Alternative: Event Reference')}
Instead of inline ${chalk.yellow('event')}, you can use ${chalk.yellow('eventRef')} to reference a library event:
  ${chalk.green('"eventRef"')}: "library.event.name"  ${chalk.dim('// Reference event from library')}

${chalk.bold('Note on Colors:')} Event nodes do ${chalk.bold('NOT')} require a color field.
Colors are derived at render time from:
  - ${chalk.cyan('Border color')}: from scope (defined in library.yaml owned-scopes)
  - ${chalk.cyan('Fill color')}: from span (defined in .spans.canvas)
See ${chalk.yellow('formats colors')} for the complete color contract.

${chalk.bold('Event Schema Format:')}
${chalk.red.bold('IMPORTANT:')} The "event" field must be an ${chalk.bold('object')}, not a string!

${chalk.dim('┌─────────────────────────────────────────────────────────────────┐')}
${chalk.dim('│')} ${chalk.green('"event"')}: {                        ${chalk.dim('// Top-level, NOT inside pv')} ${chalk.dim('│')}
${chalk.dim('│')}   ${chalk.yellow('"name"')}: "validation.started",     ${chalk.dim('// Event name')}         ${chalk.dim('│')}
${chalk.dim('│')}   ${chalk.yellow('"attributes"')}: {                   ${chalk.dim('// Attribute definitions')} ${chalk.dim('│')}
${chalk.dim('│')}     "input.recordCount": {                                        ${chalk.dim('│')}
${chalk.dim('│')}       ${chalk.cyan('"type"')}: "integer",            ${chalk.dim('// string|number|integer|boolean|object|array')} ${chalk.dim('│')}
${chalk.dim('│')}       ${chalk.cyan('"description"')}: "Number of records to validate",       ${chalk.dim('│')}
${chalk.dim('│')}       ${chalk.cyan('"required"')}: true                                      ${chalk.dim('│')}
${chalk.dim('│')}     }                                                             ${chalk.dim('│')}
${chalk.dim('│')}   }                                                               ${chalk.dim('│')}
${chalk.dim('│')} }                                                                 ${chalk.dim('│')}
${chalk.dim('└─────────────────────────────────────────────────────────────────┘')}

${chalk.red.bold('DEPRECATED FORMATS:')}
  ${chalk.yellow('type: "text" with pv.event')} - Use ${chalk.green('type: "otel-event" with top-level event')}
  ${chalk.yellow('pv.status')} - Use ${chalk.green('otel.status')} at top level
  ${chalk.yellow('pv.references')} - Use ${chalk.green('otel.files')} at top level
  ${chalk.yellow('"sources"')} - Use ${chalk.green('"otel.files"')} instead

${chalk.bold('Migration:')}
  Run ${chalk.cyan('npx @principal-ai/principal-studio-cli migrate-nodes')} to auto-migrate
  legacy format files to the semantic format.

${chalk.bold('Edge Required Fields:')}

  ${chalk.green('pv.edgeType')}  ${chalk.dim('string')}   Edge type (must be defined in pv.edgeTypes)

${chalk.bold('Canvas-Level Required Fields:')}

  ${chalk.green('pv.name')}      ${chalk.dim('string')}   Feature name
  ${chalk.green('pv.version')}   ${chalk.dim('string')}   Schema version
  ${chalk.green('pv.markdown')}  ${chalk.dim('string')}   Path to documentation file

${chalk.bold('Event Schema Best Practices:')}

${chalk.cyan('1. Canvas represents complete, encompassing functionality:')}
   ✅ API route - Full request/response cycle
   ✅ CLI command - Complete tool execution
   ✅ Business operation - End-to-end workflow
   ❌ Individual helper functions (too granular)

${chalk.cyan('2. Event naming convention:')}
   ${chalk.yellow('<feature>.<operation>.<state>')}
   Examples:
   - validation.started
   - validation.complete
   - validation.error
   - import.parsing.complete

${chalk.cyan('3. Capture the shape of the code:')}
   - Events should reflect actual decision points and state transitions
   - If the code branches, those branches likely need distinct events
   - If the code has phases/stages, those are natural event boundaries
   - Don't limit yourself artificially - match the code structure

${chalk.cyan('4. Attribute naming conventions:')}
   ${chalk.yellow('<category>.<name>')}
   - input.*     (input.size, input.recordCount)
   - output.*    (output.count, output.success)
   - result.*    (result.validCount, result.invalidCount)
   - error.*     (error.type, error.message, error.stage)
   - duration.*  (duration.ms)

${chalk.cyan('5. Required vs Optional attributes:')}
   - ${chalk.green('required')}: Essential data needed for validation
   - ${chalk.yellow('optional')}: Nice-to-have context, won't fail validation if missing

${chalk.bold('Validation:')}
  ${chalk.cyan('npx @principal-ai/principal-studio-cli validate')}
`,

  workflow: `
${chalk.bold.cyan('Workflow Format (.workflow.json)')}
${chalk.dim('═'.repeat(70))}

Workflow files define scenarios for rendering execution data as human-readable
stories. Scenarios are matched based on required events (derived from template.events).

${chalk.bold('File Location:')}
  ${chalk.dim('.principal-views/')}${chalk.yellow('<feature-name>.workflow.json')}
  ${chalk.dim('(co-located with corresponding .otel.canvas file)')}

${chalk.bold('Required Structure:')}
${chalk.dim('┌────────────────────────────────────────────────────────────────────┐')}
${chalk.dim('│')} {                                                                  ${chalk.dim('│')}
${chalk.dim('│')}   ${chalk.green('"version"')}: "1.0.0",          ${chalk.dim('// Schema version (required)')}    ${chalk.dim('│')}
${chalk.dim('│')}   ${chalk.green('"canvas"')}: "./feature.otel.canvas",  ${chalk.dim('// Canvas reference')}     ${chalk.dim('│')}
${chalk.dim('│')}   ${chalk.green('"name"')}: "Feature Name",      ${chalk.dim('// NOT "Feature Name Workflows"')} ${chalk.dim('│')}
${chalk.dim('│')}   ${chalk.green('"description"')}: "What the feature does",                        ${chalk.dim('│')}
${chalk.dim('│')}   ${chalk.green('"spanPattern"')}: "feature.operation",  ${chalk.dim('// Exact span name')}     ${chalk.dim('│')}
${chalk.dim('│')}   ${chalk.green('"scenarioSelection"')}: "first-match",  ${chalk.dim('// Optional')}            ${chalk.dim('│')}
${chalk.dim('│')}   ${chalk.green('"scenarios"')}: [                                                 ${chalk.dim('│')}
${chalk.dim('│')}     {                                                              ${chalk.dim('│')}
${chalk.dim('│')}       ${chalk.yellow('"id"')}: "success",         ${chalk.dim('// Unique scenario ID')}         ${chalk.dim('│')}
${chalk.dim('│')}       ${chalk.yellow('"priority"')}: 1,           ${chalk.dim('// Lower = higher priority')}   ${chalk.dim('│')}
${chalk.dim('│')}       ${chalk.yellow('"description"')}: "Successful execution",                    ${chalk.dim('│')}
${chalk.dim('│')}       ${chalk.yellow('"template"')}: {            ${chalk.dim('// Workflow template')}        ${chalk.dim('│')}
${chalk.dim('│')}         ${chalk.cyan('"events"')}: {                ${chalk.dim('// REQUIRED: per-event templates')} ${chalk.dim('│')}
${chalk.dim('│')}           "event.started": "Started {{attr}}",                   ${chalk.dim('│')}
${chalk.dim('│')}           "event.complete": "Completed successfully"             ${chalk.dim('│')}
${chalk.dim('│')}         },                                                         ${chalk.dim('│')}
${chalk.dim('│')}         ${chalk.cyan('"summary"')}: "Completed {{count}} items"  ${chalk.dim('// Optional')}    ${chalk.dim('│')}
${chalk.dim('│')}       }                                                            ${chalk.dim('│')}
${chalk.dim('│')}     }                                                              ${chalk.dim('│')}
${chalk.dim('│')}   ]                                                                ${chalk.dim('│')}
${chalk.dim('│')} }                                                                  ${chalk.dim('│')}
${chalk.dim('└────────────────────────────────────────────────────────────────────┘')}

${chalk.bold('Required Fields:')}

  ${chalk.cyan('version')}            Schema version (e.g., "1.0.0")
  ${chalk.cyan('canvas')}             Path to .otel.canvas file
  ${chalk.cyan('name')}               Human-readable name (NOT "...Workflows")
  ${chalk.cyan('description')}        Feature purpose (NOT "Workflows for...")
  ${chalk.cyan('spanPattern')}        Exact span name to match
  ${chalk.cyan('scenarios')}          Array of scenario definitions

${chalk.bold('Optional Fields:')}

  ${chalk.cyan('scope')}              Instrumentation scope (must be in library.yaml owned-scopes)
  ${chalk.cyan('status')}             "draft", "approved", or "implemented"
  ${chalk.cyan('files')}              Source files (required if status is approved/implemented)
  ${chalk.cyan('scenarioSelection')}  "first-match" (default) or "manual"
  ${chalk.cyan('formatting')}         Display options (showTimestamps, showDuration, etc.)

${chalk.bold('Scenario Best Practices:')}

${chalk.cyan('1. Required scenario fields:')}
   - ${chalk.green('id')}          Unique identifier (kebab-case)
   - ${chalk.green('priority')}    Selection order (lower = higher priority)
   - ${chalk.green('description')} What this scenario represents
   - ${chalk.green('template')}    Template with events mapping

${chalk.cyan('2. Priority ordering (scenarios evaluated in order):')}
   - ${chalk.green('1-10')}    Specific scenarios (success/failure cases)
   - ${chalk.yellow('999')}     Fallback scenario (catches anything)

${chalk.cyan('3. Standard scenario set:')}
   - ${chalk.green('Success')} (priority 1): Feature completed successfully
   - ${chalk.yellow('Failure')} (priority 2): Feature encountered error
   - ${chalk.dim('Fallback')} (priority 999): Generic execution captured

${chalk.cyan('4. Template syntax (Handlebars):')}
   Templates use Handlebars syntax for dynamic content:

   ${chalk.bold('Variables:')}
   - {{variable}}           Simple variable
   - {{result.count}}       Nested property
   - {{error.message}}      Deeply nested

   ${chalk.bold('Conditionals:')}
   - {{#if condition}}...{{/if}}                    If block
   - {{#if condition}}...{{else}}...{{/if}}         If-else
   - {{#if (eq status "ok")}}✅{{else}}❌{{/if}}    Comparison

   ${chalk.bold('Loops:')}
   - {{#each items}}{{this}}{{/each}}               Iterate array
   - {{#each items}}{{@index}}: {{this}}{{/each}}   With index

   ${chalk.bold('Comparison helpers:')}
   - eq, ne, lt, gt, lte, gte, and, or, not
   - Example: {{#if (gt count 10)}}Many{{/if}}

   ${chalk.bold('Span attributes (@span):')}
   Access parent span attributes without duplicating them in events:

   - {{@span.output.status}}        Span attribute "output.status"
   - {{@span.project.name}}         Nested span attribute

   ${chalk.dim('Why use @span?')}
   Span attributes are set once on the span and apply to the entire operation.
   Event attributes are specific to that moment. Using @span avoids duplicating
   span-level data into every event:

   ${chalk.dim('// In telemetry code - no duplication needed:')}
   ${chalk.dim('span.setAttributes({ "output.status": "success" });')}
   ${chalk.dim('span.addEvent("task.completed", { "task.id": "123" });')}

   ${chalk.dim('// In template - access both:')}
   ${chalk.dim('"Task {{task.id}} done (status: {{@span.output.status}})"')}

${chalk.cyan('5. Template requirements:')}
   ${chalk.bold('IMPORTANT:')} The ${chalk.yellow('"events"')} field is ${chalk.bold('REQUIRED')} in all templates
   - Must be a non-empty object mapping event names to templates
   - All event names must exist in the canvas
   - Required events are ${chalk.bold('automatically derived')} from template.events keys
   - Example: { "event.name": "Template with {{variables}}" }

${chalk.cyan('6. Template style:')}
   - Clear, concise summary line
   - 3-5 detail steps showing workflow
   - Use emojis for visual scanning (✅ ❌ 📋)
   - Include key metrics and IDs

${chalk.red.bold('DEPRECATED - DO NOT USE:')}
   The ${chalk.yellow('"condition"')} field is no longer supported.
   Required events are now automatically derived from template.events keys.
   Remove any "condition" fields from your workflow files.

${chalk.bold('Validation:')}
  ${chalk.cyan('npx @principal-ai/principal-studio-cli workflow validate')}
`,

  execution: `
${chalk.bold.cyan('Execution Format (.otel.json)')}
${chalk.dim('═'.repeat(70))}

Execution files use the ${chalk.bold('standard OTLP (OpenTelemetry Protocol) JSON format')}.
These files are exported by OpenTelemetry SDK and used for visualization
and validation against canvas schemas.

${chalk.bold('File Location:')}
  ${chalk.yellow('__executions__/')}${chalk.dim('<feature-name>.otel.json')}
  ${chalk.dim('(auto-generated by test infrastructure with OpenTelemetry SDK)')}

${chalk.bold('IMPORTANT:')} __executions__/ directory must be committed to git!

${chalk.bold('File Structure (OTLP JSON Format):')}
${chalk.dim('┌────────────────────────────────────────────────────────────────────┐')}
${chalk.dim('│')} {                                                                  ${chalk.dim('│')}
${chalk.dim('│')}   ${chalk.green('"resourceSpans"')}: [                  ${chalk.dim('// OTLP root structure')}      ${chalk.dim('│')}
${chalk.dim('│')}     {                                                              ${chalk.dim('│')}
${chalk.dim('│')}       ${chalk.yellow('"resource"')}: {                                                  ${chalk.dim('│')}
${chalk.dim('│')}         ${chalk.cyan('"attributes"')}: [                                              ${chalk.dim('│')}
${chalk.dim('│')}           { "key": "service.name", "value": { "stringValue": "..." }} ${chalk.dim('│')}
${chalk.dim('│')}         ]                                                          ${chalk.dim('│')}
${chalk.dim('│')}       },                                                            ${chalk.dim('│')}
${chalk.dim('│')}       ${chalk.yellow('"scopeSpans"')}: [                                               ${chalk.dim('│')}
${chalk.dim('│')}         {                                                          ${chalk.dim('│')}
${chalk.dim('│')}           ${chalk.cyan('"scope"')}: { "name": "...", "version": "..." },           ${chalk.dim('│')}
${chalk.dim('│')}           ${chalk.cyan('"spans"')}: [                                                ${chalk.dim('│')}
${chalk.dim('│')}             {                                                      ${chalk.dim('│')}
${chalk.dim('│')}               "traceId": "4bf92f3577b34da6...",  ${chalk.dim('// 32 hex chars')}   ${chalk.dim('│')}
${chalk.dim('│')}               "spanId": "00f067aa0ba902b7",      ${chalk.dim('// 16 hex chars')}   ${chalk.dim('│')}
${chalk.dim('│')}               "name": "test:feature-name",       ${chalk.dim('// Span name')}      ${chalk.dim('│')}
${chalk.dim('│')}               "kind": 0,                         ${chalk.dim('// 0=INTERNAL')}     ${chalk.dim('│')}
${chalk.dim('│')}               "startTimeUnixNano": "1703...",    ${chalk.dim('// Unix nanoseconds')} ${chalk.dim('│')}
${chalk.dim('│')}               "endTimeUnixNano": "1703...",      ${chalk.dim('// Unix nanoseconds')} ${chalk.dim('│')}
${chalk.dim('│')}               "attributes": [                    ${chalk.dim('// Key-value pairs')} ${chalk.dim('│')}
${chalk.dim('│')}                 { "key": "input.size", "value": { "intValue": 42 } } ${chalk.dim('│')}
${chalk.dim('│')}               ],                                                    ${chalk.dim('│')}
${chalk.dim('│')}               "events": [                        ${chalk.dim('// Span events')}    ${chalk.dim('│')}
${chalk.dim('│')}                 {                                                  ${chalk.dim('│')}
${chalk.dim('│')}                   "timeUnixNano": "1703...",                      ${chalk.dim('│')}
${chalk.dim('│')}                   "name": "validation.started",                   ${chalk.dim('│')}
${chalk.dim('│')}                   "attributes": [...]                             ${chalk.dim('│')}
${chalk.dim('│')}                 }                                                  ${chalk.dim('│')}
${chalk.dim('│')}               ]                                                    ${chalk.dim('│')}
${chalk.dim('│')}             }                                                      ${chalk.dim('│')}
${chalk.dim('│')}           ]                                                        ${chalk.dim('│')}
${chalk.dim('│')}         }                                                          ${chalk.dim('│')}
${chalk.dim('│')}       ]                                                            ${chalk.dim('│')}
${chalk.dim('│')}     }                                                              ${chalk.dim('│')}
${chalk.dim('│')}   ]                                                                ${chalk.dim('│')}
${chalk.dim('│')} }                                                                  ${chalk.dim('│')}
${chalk.dim('└────────────────────────────────────────────────────────────────────┘')}

${chalk.bold('OTLP Format Details:')}

${chalk.cyan('resourceSpans')} ${chalk.dim('(array, required)')}
  Root array containing resource-grouped spans

${chalk.cyan('resource.attributes')} ${chalk.dim('(array)')}
  Metadata about the service (e.g., service.name)

${chalk.cyan('scopeSpans')} ${chalk.dim('(array, required)')}
  Instrumentation scope-grouped spans

${chalk.cyan('spans')} ${chalk.dim('(array, required)')}
  Array of span objects with OTLP structure

${chalk.bold('Span Fields (OTLP Standard):')}

${chalk.cyan('traceId')} ${chalk.dim('(string)')} - Unique trace identifier (32 hex chars)
${chalk.cyan('spanId')} ${chalk.dim('(string)')} - Unique span identifier (16 hex chars)
${chalk.cyan('parentSpanId')} ${chalk.dim('(string, optional)')} - Parent span ID
${chalk.cyan('name')} ${chalk.dim('(string)')} - Operation name
${chalk.cyan('kind')} ${chalk.dim('(number)')} - 0=UNSPECIFIED, 1=INTERNAL, 2=SERVER, 3=CLIENT, 4=PRODUCER, 5=CONSUMER
${chalk.cyan('startTimeUnixNano')} ${chalk.dim('(string)')} - Start time in Unix nanoseconds
${chalk.cyan('endTimeUnixNano')} ${chalk.dim('(string)')} - End time in Unix nanoseconds
${chalk.cyan('attributes')} ${chalk.dim('(array)')} - Key-value pairs: [{ key, value: { stringValue|intValue|... } }]
${chalk.cyan('events')} ${chalk.dim('(array)')} - Span events with timestamps and attributes
${chalk.cyan('status')} ${chalk.dim('(object)')} - Status: { code: 1=OK, 2=ERROR }

${chalk.bold('Attribute Value Format:')}
  { "stringValue": "..." }  ${chalk.dim('// For strings')}
  { "intValue": 42 }        ${chalk.dim('// For integers')}
  { "doubleValue": 3.14 }   ${chalk.dim('// For floats')}
  { "boolValue": true }     ${chalk.dim('// For booleans')}

${chalk.bold('Generation:')}
  Use OpenTelemetry SDK with OTLP JSON exporter
  Example: @opentelemetry/sdk-trace-node + InMemorySpanExporter
  See: tests/otel-setup.ts in the add-skill repository

${chalk.bold('Validation:')}
  ${chalk.cyan('npx @principal-ai/principal-studio-cli validate-execution <file>')}

${chalk.bold('Resources:')}
  OTLP Spec: https://opentelemetry.io/docs/specs/otlp/
  OpenTelemetry JS: https://github.com/open-telemetry/opentelemetry-js
`,

  library: `
${chalk.bold.cyan('Library Format (library.yaml)')}
${chalk.dim('═'.repeat(70))}

Library files define the service registry and component libraries for a project.
They document OTEL resource attributes and provide a central registry of all
services in the repository.

${chalk.bold('File Location:')}
  ${chalk.dim('.principal-views/')}${chalk.yellow('library.yaml')}
  ${chalk.dim('(created by npx @principal-ai/principal-studio-cli init)')}

${chalk.bold('Required Structure:')}
${chalk.dim('┌────────────────────────────────────────────────────────────────────┐')}
${chalk.dim('│')} ${chalk.green('version')}: "1.0.0"                                                  ${chalk.dim('│')}
${chalk.dim('│')} ${chalk.green('name')}: "@org/package-name"      ${chalk.dim('// npm package name')}           ${chalk.dim('│')}
${chalk.dim('│')} ${chalk.green('description')}: "Package description"                                ${chalk.dim('│')}
${chalk.dim('│')}                                                                    ${chalk.dim('│')}
${chalk.dim('│')} ${chalk.yellow('# Service resource registry')}                                        ${chalk.dim('│')}
${chalk.dim('│')} ${chalk.yellow('# Define all services in this repository with their OTEL resource')} ${chalk.dim('│')}
${chalk.dim('│')} ${chalk.yellow('# attributes. Each service configures its own resources at runtime,')} ${chalk.dim('│')}
${chalk.dim('│')} ${chalk.yellow('# but declaring them here provides:')}                                ${chalk.dim('│')}
${chalk.dim('│')} ${chalk.yellow('# - Service documentation/registry')}                                 ${chalk.dim('│')}
${chalk.dim('│')} ${chalk.yellow('# - Expected resource schema for validation')}                        ${chalk.dim('│')}
${chalk.dim('│')} ${chalk.yellow('# - Dev workspace trace routing')}                                    ${chalk.dim('│')}
${chalk.dim('│')}                                                                    ${chalk.dim('│')}
${chalk.dim('│')} ${chalk.green('resources')}:                                                          ${chalk.dim('│')}
${chalk.dim('│')}   my-service:                    ${chalk.dim('// Service identifier')}            ${chalk.dim('│')}
${chalk.dim('│')}     ${chalk.cyan('service.name')}: "my-service"  ${chalk.dim('// OTEL service.name attribute')} ${chalk.dim('│')}
${chalk.dim('│')}     ${chalk.cyan('service.version')}: "1.0.0"    ${chalk.dim('// OTEL service.version')}        ${chalk.dim('│')}
${chalk.dim('│')}     ${chalk.cyan('deployment.environment')}: "development"  ${chalk.dim('// Environment')}      ${chalk.dim('│')}
${chalk.dim('│')}     ${chalk.cyan('project')}: "my-project"       ${chalk.dim('// Project/feature name')}        ${chalk.dim('│')}
${chalk.dim('│')}     ${chalk.yellow('# service.repository.url and service.commit.sha are auto-detected')} ${chalk.dim('│')}
${chalk.dim('│')}     ${chalk.yellow('# from git locally and set via environment variables in production')} ${chalk.dim('│')}
${chalk.dim('│')}                                                                    ${chalk.dim('│')}
${chalk.dim('│')} ${chalk.green('nodeComponents')}: {}             ${chalk.dim('// Optional component library')}    ${chalk.dim('│')}
${chalk.dim('│')} ${chalk.green('edgeComponents')}: {}             ${chalk.dim('// Optional component library')}    ${chalk.dim('│')}
${chalk.dim('└────────────────────────────────────────────────────────────────────┘')}

${chalk.bold('Service Resource Registry:')}

The ${chalk.cyan('resources')} section documents all services in the repository that emit
OpenTelemetry traces. Each service entry should match the resource attributes
configured in your OTEL SDK initialization.

${chalk.bold('Required Fields:')}
  ${chalk.cyan('version')}             Library version (string)
  ${chalk.cyan('name')}                Package name, typically npm package name
  ${chalk.cyan('description')}         Brief description of the package
  ${chalk.cyan('resources')}           Service registry object (can be empty {})
  ${chalk.cyan('nodeComponents')}      Component definitions (can be empty {})
  ${chalk.cyan('edgeComponents')}      Component definitions (can be empty {})

${chalk.bold('Common OTEL Resource Attributes:')}

${chalk.cyan('service.name')} ${chalk.dim('(required)')}
  The logical name of the service. This is the primary identifier used to
  group traces from the same service.
  Example: "my-api-server", "storybook", "integration-tests"

${chalk.cyan('service.version')} ${chalk.dim('(recommended)')}
  The version of the service. Typically matches the package.json version.
  Example: "1.2.3", "0.14.0"

${chalk.cyan('deployment.environment')} ${chalk.dim('(recommended)')}
  The deployment environment.
  Common values: "development", "staging", "production"

${chalk.bold('Auto-Detected Attributes:')}

The following attributes are typically auto-detected from git:
  ${chalk.cyan('service.repository.url')}  Git repository URL
  ${chalk.cyan('service.commit.sha')}      Current commit hash

${chalk.bold('Use Cases:')}

${chalk.cyan('1. Storybook with OTEL Addon:')}
${chalk.dim('┌────────────────────────────────────────────────────────────────────┐')}
${chalk.dim('│')} resources:                                                         ${chalk.dim('│')}
${chalk.dim('│')}   my-storybook:                                                    ${chalk.dim('│')}
${chalk.dim('│')}     service.name: "my-storybook"                                   ${chalk.dim('│')}
${chalk.dim('│')}     service.version: "0.1.0"                                       ${chalk.dim('│')}
${chalk.dim('│')}     deployment.environment: "development"                          ${chalk.dim('│')}
${chalk.dim('│')}     project: "ui-components"                                       ${chalk.dim('│')}
${chalk.dim('└────────────────────────────────────────────────────────────────────┘')}

${chalk.cyan('2. Multiple Services in Monorepo:')}
${chalk.dim('┌────────────────────────────────────────────────────────────────────┐')}
${chalk.dim('│')} resources:                                                         ${chalk.dim('│')}
${chalk.dim('│')}   api-server:                                                      ${chalk.dim('│')}
${chalk.dim('│')}     service.name: "api-server"                                     ${chalk.dim('│')}
${chalk.dim('│')}     service.version: "2.0.0"                                       ${chalk.dim('│')}
${chalk.dim('│')}     deployment.environment: "production"                           ${chalk.dim('│')}
${chalk.dim('│')}   worker-service:                                                  ${chalk.dim('│')}
${chalk.dim('│')}     service.name: "worker-service"                                 ${chalk.dim('│')}
${chalk.dim('│')}     service.version: "1.5.0"                                       ${chalk.dim('│')}
${chalk.dim('│')}     deployment.environment: "production"                           ${chalk.dim('│')}
${chalk.dim('└────────────────────────────────────────────────────────────────────┘')}

${chalk.cyan('3. Test Environment:')}
${chalk.dim('┌────────────────────────────────────────────────────────────────────┐')}
${chalk.dim('│')} resources:                                                         ${chalk.dim('│')}
${chalk.dim('│')}   integration-tests:                                               ${chalk.dim('│')}
${chalk.dim('│')}     service.name: "integration-tests"                              ${chalk.dim('│')}
${chalk.dim('│')}     service.version: "1.0.0"                                       ${chalk.dim('│')}
${chalk.dim('│')}     deployment.environment: "test"                                 ${chalk.dim('│')}
${chalk.dim('│')}     test.suite: "integration"                                      ${chalk.dim('│')}
${chalk.dim('└────────────────────────────────────────────────────────────────────┘')}

${chalk.bold('Best Practices:')}

${chalk.cyan('1. Service Name Consistency:')}
   Ensure the ${chalk.yellow('service.name')} in library.yaml matches the resource attributes
   configured in your OTEL SDK initialization code.

${chalk.cyan('2. Version Synchronization:')}
   Keep ${chalk.yellow('service.version')} in sync with your package.json version.

${chalk.cyan('3. Document All Services:')}
   Add an entry for every service in your repository that emits traces.
   This creates a central registry for understanding trace sources.

${chalk.cyan('4. Use Descriptive Service Names:')}
   Service names should clearly identify the component:
   ✅ "payment-processor-api"
   ✅ "user-dashboard-ui"
   ❌ "service1"
   ❌ "app"

${chalk.bold('Integration with OTEL SDK:')}

Your OTEL SDK configuration should match library.yaml resources:

${chalk.dim('// Example: @opentelemetry/sdk-trace-web initialization')}
${chalk.dim('const provider = new WebTracerProvider({')}
${chalk.dim('  resource: new Resource({')}
${chalk.dim('    [SEMRESATTRS_SERVICE_NAME]: "my-storybook",')}
${chalk.dim('    [SEMRESATTRS_SERVICE_VERSION]: "0.1.0",')}
${chalk.dim('    [SEMRESATTRS_DEPLOYMENT_ENVIRONMENT]: "development",')}
${chalk.dim('  }),')}
${chalk.dim('});')}

${chalk.bold('Initialization:')}
  ${chalk.cyan('npx @principal-ai/principal-studio-cli init')}
  Creates .principal-views/library.yaml with template and comments

${chalk.bold('More Info:')}
  OpenTelemetry Resource Spec: https://opentelemetry.io/docs/specs/semconv/resource/
  OpenTelemetry JS: https://github.com/open-telemetry/opentelemetry-js
`,

  scopes: `
${chalk.bold.cyan('Scopes Canvas Format (.scopes.canvas)')}
${chalk.dim('═'.repeat(70))}

Scopes canvas files document instrumentation scope boundaries. They visualize
which parts of your codebase are instrumented and validate against the
owned-scopes declared in library.yaml.

${chalk.bold('File Location:')}
  ${chalk.dim('.principal-views/')}${chalk.yellow('architecture.scopes.canvas')}
  ${chalk.dim('(or <name>.scopes.canvas)')}

${chalk.bold('Required Structure:')}
${chalk.dim('┌────────────────────────────────────────────────────────────────────┐')}
${chalk.dim('│')} {                                                                  ${chalk.dim('│')}
${chalk.dim('│')}   ${chalk.green('"nodes"')}: [                                                       ${chalk.dim('│')}
${chalk.dim('│')}     {                                                              ${chalk.dim('│')}
${chalk.dim('│')}       ${chalk.yellow('"id"')}: "scope-node-id",                                        ${chalk.dim('│')}
${chalk.dim('│')}       ${chalk.green('"type"')}: "otel-scope",          ${chalk.dim('// Required: scope node type')}  ${chalk.dim('│')}
${chalk.dim('│')}       ${chalk.yellow('"x"')}: 0, ${chalk.yellow('"y"')}: 0, ${chalk.yellow('"width"')}: 200, ${chalk.yellow('"height"')}: 100,                   ${chalk.dim('│')}
${chalk.dim('│')}       ${chalk.yellow('"color"')}: "#4CAF50",                                           ${chalk.dim('│')}
${chalk.dim('│')}       ${chalk.green('"otel"')}: {                                                      ${chalk.dim('│')}
${chalk.dim('│')}         ${chalk.cyan('"scope"')}: "my-scope-name",    ${chalk.dim('// Must match library.yaml')}   ${chalk.dim('│')}
${chalk.dim('│')}         ${chalk.cyan('"description"')}: "What this scope instruments",              ${chalk.dim('│')}
${chalk.dim('│')}         ${chalk.cyan('"status"')}: "implemented"      ${chalk.dim('// draft|approved|implemented')} ${chalk.dim('│')}
${chalk.dim('│')}       }                                                            ${chalk.dim('│')}
${chalk.dim('│')}     }                                                              ${chalk.dim('│')}
${chalk.dim('│')}   ],                                                               ${chalk.dim('│')}
${chalk.dim('│')}   ${chalk.green('"edges"')}: []                      ${chalk.dim('// Optional: scope relationships')} ${chalk.dim('│')}
${chalk.dim('│')} }                                                                  ${chalk.dim('│')}
${chalk.dim('└────────────────────────────────────────────────────────────────────┘')}

${chalk.bold('Node Required Fields:')}

  ${chalk.green('type')}             ${chalk.dim('string')}   Must be "otel-scope"
  ${chalk.green('otel.scope')}       ${chalk.dim('string')}   Scope name (must match library.yaml owned-scopes)
  ${chalk.green('otel.description')} ${chalk.dim('string')}   What this scope instruments

${chalk.bold('Relationship to library.yaml:')}

The scopes canvas validates against the ${chalk.cyan('owned-scopes')} field in library.yaml:

${chalk.dim('┌────────────────────────────────────────────────────────────────────┐')}
${chalk.dim('│')} ${chalk.yellow('# library.yaml')}                                                     ${chalk.dim('│')}
${chalk.dim('│')} resources:                                                         ${chalk.dim('│')}
${chalk.dim('│')}   my-service:                                                      ${chalk.dim('│')}
${chalk.dim('│')}     service.name: "my-service"                                     ${chalk.dim('│')}
${chalk.dim('│')}     ${chalk.green('owned-scopes')}:                   ${chalk.dim('// Scopes this service owns')}   ${chalk.dim('│')}
${chalk.dim('│')}       - validation                   ${chalk.dim('// Simple scope name')}          ${chalk.dim('│')}
${chalk.dim('│')}       - import-processing            ${chalk.dim('// Another scope')}              ${chalk.dim('│')}
${chalk.dim('└────────────────────────────────────────────────────────────────────┘')}

${chalk.bold('Validation Rules:')}

${chalk.cyan('1. Scopes canvas required when owned-scopes exist:')}
   If library.yaml defines owned-scopes, a .scopes.canvas must exist.

${chalk.cyan('2. All owned-scopes must be documented:')}
   Each scope in owned-scopes must have a corresponding node with
   pv.otel.scope set to that scope name.

${chalk.cyan('3. Extra scopes trigger warnings:')}
   Scopes in the canvas but not in owned-scopes are flagged as warnings.
   Either add them to library.yaml or remove from canvas.

${chalk.cyan('4. Node structure validation:')}
   - pv.nodeType must be "scope"
   - pv.description should explain what the scope covers

${chalk.bold('Example Scopes Canvas:')}
${chalk.dim('─'.repeat(70))}
${chalk.yellow('.principal-views/architecture.scopes.canvas')}

{
  "nodes": [
    {
      "id": "validation-scope",
      ${chalk.green('"type": "otel-scope"')},
      "x": 0, "y": 0, "width": 200, "height": 120,
      ${chalk.green('"color": "#4CAF50"')},
      ${chalk.green('"otel"')}: {
        ${chalk.green('"scope"')}: "validation",
        ${chalk.green('"description"')}: "Validates incoming data against schemas",
        ${chalk.green('"status"')}: "implemented"
      }
    },
    {
      "id": "import-scope",
      "type": "otel-scope",
      "x": 250, "y": 0, "width": 200, "height": 120,
      "color": "#2196F3",
      "otel": {
        "scope": "import-processing",
        "description": "Handles data import from external sources",
        "status": "implemented"
      }
    }
  ],
  "edges": [
    {
      "id": "import-to-validation",
      "fromNode": "import-scope",
      "toNode": "validation-scope",
      "fromSide": "right",
      "toSide": "left"
    }
  ]
}

${chalk.bold('Validation:')}
  ${chalk.cyan('npx @principal-ai/principal-studio-cli scopes validate')}
  ${chalk.cyan('npx @principal-ai/principal-studio-cli scopes validate --json')}
`,

  spans: `
${chalk.bold.cyan('Spans Canvas Format (.spans.canvas)')}
${chalk.dim('═'.repeat(70))}

Spans canvas files define span conventions (operation types) for your project.
Each span convention defines a pattern for matching spans and a color that is
used as the fill color for events emitted within that span.

${chalk.bold('File Location:')}
  ${chalk.dim('.principal-views/')}${chalk.yellow('architecture.spans.canvas')}
  ${chalk.dim('(or <name>.spans.canvas)')}

${chalk.bold('Required Structure:')}
${chalk.dim('┌────────────────────────────────────────────────────────────────────┐')}
${chalk.dim('│')} {                                                                  ${chalk.dim('│')}
${chalk.dim('│')}   ${chalk.green('"pv"')}: {                                                          ${chalk.dim('│')}
${chalk.dim('│')}     ${chalk.yellow('"name"')}: "Project Span Conventions",                             ${chalk.dim('│')}
${chalk.dim('│')}     ${chalk.yellow('"version"')}: "1.0.0"                                              ${chalk.dim('│')}
${chalk.dim('│')}   },                                                                 ${chalk.dim('│')}
${chalk.dim('│')}   ${chalk.green('"nodes"')}: [                                                       ${chalk.dim('│')}
${chalk.dim('│')}     {                                                              ${chalk.dim('│')}
${chalk.dim('│')}       ${chalk.yellow('"id"')}: "validation",                                            ${chalk.dim('│')}
${chalk.dim('│')}       ${chalk.green('"type"')}: "otel-span-convention",   ${chalk.dim('// Required: span node type')} ${chalk.dim('│')}
${chalk.dim('│')}       ${chalk.yellow('"x"')}: 0, ${chalk.yellow('"y"')}: 0, ${chalk.yellow('"width"')}: 220, ${chalk.yellow('"height"')}: 100,                   ${chalk.dim('│')}
${chalk.dim('│')}       ${chalk.green('"color"')}: "#22C55E",        ${chalk.dim('// Required: span fill color')}   ${chalk.dim('│')}
${chalk.dim('│')}       ${chalk.green('"otel"')}: {                                                      ${chalk.dim('│')}
${chalk.dim('│')}         ${chalk.cyan('"spanPattern"')}: "validate.*",   ${chalk.dim('// Matches span names')}    ${chalk.dim('│')}
${chalk.dim('│')}         ${chalk.cyan('"description"')}: "Validation operations",                      ${chalk.dim('│')}
${chalk.dim('│')}         ${chalk.cyan('"status"')}: "implemented"        ${chalk.dim('// draft|approved|implemented')} ${chalk.dim('│')}
${chalk.dim('│')}       }                                                            ${chalk.dim('│')}
${chalk.dim('│')}     }                                                              ${chalk.dim('│')}
${chalk.dim('│')}   ],                                                               ${chalk.dim('│')}
${chalk.dim('│')}   ${chalk.green('"edges"')}: []                      ${chalk.dim('// Optional: span relationships')} ${chalk.dim('│')}
${chalk.dim('│')} }                                                                  ${chalk.dim('│')}
${chalk.dim('└────────────────────────────────────────────────────────────────────┘')}

${chalk.bold('Node Required Fields:')}

  ${chalk.green('type')}               ${chalk.dim('string')}   Must be "otel-span-convention"
  ${chalk.green('color')}              ${chalk.dim('string')}   Hex color for this span (used as event fill)
  ${chalk.green('otel.spanPattern')}   ${chalk.dim('string')}   Pattern to match span names
  ${chalk.green('otel.status')}        ${chalk.dim('string')}   "draft" | "approved" | "implemented"

${chalk.bold('Relationship to Workflows:')}

Span conventions are linked to workflows via the spanPattern field:

${chalk.dim('┌────────────────────────────────────────────────────────────────────┐')}
${chalk.dim('│')} ${chalk.yellow('# workflow.json')}                                                     ${chalk.dim('│')}
${chalk.dim('│')} {                                                                  ${chalk.dim('│')}
${chalk.dim('│')}   "id": "data-validation",                                         ${chalk.dim('│')}
${chalk.dim('│')}   ${chalk.green('"spanPattern"')}: "validate.*",  ${chalk.dim('// Matches spans.canvas')}       ${chalk.dim('│')}
${chalk.dim('│')}   "canvas": ".principal-views/validation.otel.canvas",             ${chalk.dim('│')}
${chalk.dim('│')}   "scenarios": [...]                                               ${chalk.dim('│')}
${chalk.dim('│')} }                                                                  ${chalk.dim('│')}
${chalk.dim('└────────────────────────────────────────────────────────────────────┘')}

${chalk.bold('Color Usage:')}

The span color is used as the ${chalk.cyan('fill color')} for event nodes when
rendering events that were emitted within that span. This allows visual
grouping of events by their parent operation.

See ${chalk.yellow('formats colors')} for the complete renderer color contract.

${chalk.bold('Validation Rules:')}

${chalk.cyan('1. Color is required:')}
   Every span convention node must have a color field.

${chalk.cyan('2. Implemented spans require workflows:')}
   Spans with status "implemented" must have a matching workflow.json.

${chalk.cyan('3. Draft spans with workflows should be upgraded:')}
   If a workflow exists for a span, its status should be "implemented".

${chalk.bold('Validation:')}
  ${chalk.cyan('npx @principal-ai/principal-studio-cli validate')}
`,

  colors: `
${chalk.bold.cyan('Renderer Color Contract')}
${chalk.dim('═'.repeat(70))}

This document specifies how renderers (e.g., File City) should apply colors
to event and span nodes. Colors communicate both scope ownership and
operational context at a glance.

${chalk.bold('Color Model:')}

  ${chalk.cyan('┌─────────────────────────────────────────────────────────────────┐')}
  ${chalk.cyan('│')}  ${chalk.bold('EVENT NODE')}                                                    ${chalk.cyan('│')}
  ${chalk.cyan('│')}  ┌───────────────────────────────────────────────────────────┐  ${chalk.cyan('│')}
  ${chalk.cyan('│')}  │                                                           │  ${chalk.cyan('│')}
  ${chalk.cyan('│')}  │   ${chalk.bgGreen.black(' FILL: from span color ')}                              │  ${chalk.cyan('│')}
  ${chalk.cyan('│')}  │   ${chalk.dim('(defined in .spans.canvas)')}                              │  ${chalk.cyan('│')}
  ${chalk.cyan('│')}  │                                                           │  ${chalk.cyan('│')}
  ${chalk.cyan('│')}  └───────────────────────────────────────────────────────────┘  ${chalk.cyan('│')}
  ${chalk.cyan('│')}    ${chalk.yellow('↑ BORDER: from scope color')}                                   ${chalk.cyan('│')}
  ${chalk.cyan('│')}    ${chalk.dim('(defined in library.yaml owned-scopes)')}                       ${chalk.cyan('│')}
  ${chalk.cyan('└─────────────────────────────────────────────────────────────────┘')}

${chalk.bold('Color Sources:')}

${chalk.cyan('1. Scope Color → Border')}
   Source: ${chalk.yellow('library.yaml')} resources.[service].owned-scopes.[scope].color
   Purpose: Identifies which instrumentation boundary the event belongs to

   ${chalk.dim('resources:')}
   ${chalk.dim('  my-service:')}
   ${chalk.dim('    owned-scopes:')}
   ${chalk.dim('      validation:')}
   ${chalk.green('        color: "#22C55E"')}  ${chalk.dim('← This becomes border color')}

${chalk.cyan('2. Span Color → Fill')}
   Source: ${chalk.yellow('.spans.canvas')} node color field
   Purpose: Shows which operation type the event was emitted from

   ${chalk.dim('{')}
   ${chalk.dim('  "id": "validate-operation",')}
   ${chalk.green('  "color": "#3B82F6",')}  ${chalk.dim('← This becomes fill color')}
   ${chalk.dim('  "pv": { "otel": { "spanPattern": "validate.*" } }')}
   ${chalk.dim('}')}

${chalk.bold('Rendering Rules:')}

${chalk.cyan('1. Static Context (canvas authoring):')}
   Events in .otel.canvas files do NOT have colors defined.
   Renderers should use a neutral/default color when viewing canvases
   outside of a workflow/span context.

${chalk.cyan('2. Workflow Context:')}
   When viewing events within a specific workflow:
   - Fill = color from the workflow's spanPattern's span convention
   - Border = color from the event's pv.otel.scope in library.yaml

${chalk.cyan('3. Multi-Span Events:')}
   An event may be emitted from multiple span types (e.g., same event
   in different workflows). The renderer should:
   - Use the span color from the current viewing context
   - When viewing "all events", use neutral fill or show indicator

${chalk.cyan('4. Missing Colors:')}
   - Missing scope: Use default gray border (#6B7280)
   - Missing span: Use default gray fill (#9CA3AF)
   - Draft nodes: May use a distinct draft indicator color

${chalk.bold('Shape Conventions:')}

  ${chalk.green('Event nodes')}:      Rectangle (default)
  ${chalk.yellow('Span conventions')}: Hexagon or distinct shape

This shape differentiation helps distinguish span definitions from
event definitions in mixed visualizations.

${chalk.bold('Implementation Notes:')}

Renderers should:
1. Load scope colors from library.yaml at startup
2. Load span colors from .spans.canvas files
3. Resolve event → scope via pv.otel.scope field
4. Resolve event → span via workflow.json spanPattern matching
5. Apply border and fill colors based on current context
`,

  examples: `
${chalk.bold.cyan('Complete File Examples')}
${chalk.dim('═'.repeat(70))}

${chalk.bold('Example 1: Data Validator Canvas')}
${chalk.dim('─'.repeat(70))}
${chalk.yellow('.principal-views/data-validator.otel.canvas')}

{
  "nodes": [
    {
      "id": "validation-started",
      ${chalk.green('"type": "otel-event"')},           ${chalk.dim('// Semantic node type')}
      ${chalk.green('"label"')}: "Validation Started",  ${chalk.dim('// Display label (not "text")')}
      "x": 0, "y": 0, "width": 200, "height": 100,
      ${chalk.green('"event"')}: {                      ${chalk.dim('// Top-level, NOT inside pv')}
        ${chalk.green('"name"')}: "validation.started",
        ${chalk.green('"attributes"')}: {
          "input.recordCount": {
            "type": "integer",
            "description": "Number of records to validate",
            "required": true
          },
          "input.source": {
            "type": "string",
            "description": "Source of the data",
            "required": false
          }
        }
      },
      ${chalk.green('"otel"')}: {                       ${chalk.dim('// Top-level OTEL metadata')}
        ${chalk.green('"status"')}: "draft",            ${chalk.dim('// Required status')}
        "scope": "validation",
        "files": ["src/validator.ts"]
      }
    },
    {
      "id": "validation-complete",
      "type": "otel-event",
      "label": "Validation Complete",
      "x": 250, "y": 0, "width": 200, "height": 100,
      "event": {
        "name": "validation.complete",
        "attributes": {
          "result.validCount": {
            "type": "integer",
            "description": "Number of valid records",
            "required": true
          },
          "result.invalidCount": {
            "type": "integer",
            "description": "Number of invalid records",
            "required": true
          },
          "duration.ms": {
            "type": "number",
            "description": "Validation duration in milliseconds",
            "required": false
          }
        }
      },
      "otel": {
        "status": "draft",
        "scope": "validation",
        "files": ["src/validator.ts"]
      }
    },
    {
      "id": "validation-error",
      "type": "otel-event",
      "label": "Validation Error",
      "x": 500, "y": 0, "width": 200, "height": 100,
      "event": {
        "name": "validation.error",
        "attributes": {
          "error.type": {
            "type": "string",
            "description": "Type of error that occurred",
            "required": true
          },
          "error.message": {
            "type": "string",
            "description": "Error message",
            "required": true
          },
          "error.stage": {
            "type": "string",
            "description": "Stage where error occurred",
            "required": false
          }
        }
      },
      "otel": {
        "status": "draft",
        "scope": "validation",
        "files": ["src/validator.ts"]
      }
    }
  ],
  "edges": [
    {
      "id": "started-to-complete",
      "fromNode": "validation-started",
      "toNode": "validation-complete",
      "fromSide": "right",
      "toSide": "left",
      ${chalk.green('"pv"')}: { ${chalk.green('"edgeType"')}: "sequence" }
    },
    {
      "id": "started-to-error",
      "fromNode": "validation-started",
      "toNode": "validation-error",
      "fromSide": "bottom",
      "toSide": "top",
      "pv": { "edgeType": "error-path" }
    }
  ],
  "pv": {
    "name": "Data Validator",
    "version": "1.0.0",
    ${chalk.green('"markdown"')}: ".principal-views/data-validator.md",
    ${chalk.green('"edgeTypes"')}: {
      "sequence": {
        "style": "solid",
        "color": "#666",
        "width": 2,
        "directed": true
      },
      "error-path": {
        "style": "dashed",
        "color": "#F44336",
        "width": 2,
        "directed": true
      }
    }
  }
}

${chalk.bold('Example 2: Workflow Scenarios')}
${chalk.dim('─'.repeat(70))}
${chalk.yellow('.principal-views/data-validator.workflow.json')}

${chalk.dim('Note: Workflow files reference event names defined in the canvas.')}
${chalk.dim('The canvas uses pv.event.name (e.g., "validation.started"), and')}
${chalk.dim('the workflow templates use those same event names.')}

{
  "version": "1.0.0",
  "canvas": ".principal-views/data-validator.otel.canvas",
  "name": "Data Validator",
  "description": "Validates data records against defined schemas",
  "spanPattern": "validation.process",
  "scenarioSelection": "first-match",
  "scenarios": [
    {
      "id": "success",
      "priority": 1,
      "description": "Validation completed successfully",
      "template": {
        "events": {
          "validation.started": "Started validation of {{input.recordCount}} records",
          "validation.complete": "Processed {{result.validCount}} valid, {{result.invalidCount}} invalid"
        },
        "summary": "Validated {{result.validCount}} records successfully"
      }
    },
    {
      "id": "error",
      "priority": 2,
      "description": "Validation encountered an error",
      "template": {
        "events": {
          "validation.started": "Started validation",
          "validation.error": "Error: {{error.message}} (type: {{error.type}})"
        },
        "summary": "Validation failed: {{error.message}}"
      }
    }
  ]
}

${chalk.bold.yellow('Note on Fallback Scenarios:')}
Avoid creating "fallback" scenarios that are strict subsets of other scenarios.
Instead, ensure each scenario has a distinct set of events that differentiates it.

${chalk.bold('Example 3: Execution File')}
${chalk.dim('─'.repeat(70))}
${chalk.yellow('__executions__/data-validator.otel.json')}

{
  "exportedAt": "2025-01-21T10:30:45.123Z",
  "serviceName": "my-app-tests",
  "spanCount": 3,
  "spans": [
    {
      "traceId": "4bf92f3577b34da6a3ce929d0e0e4736",
      "spanId": "00f067aa0ba902b7",
      "parentSpanId": null,
      "name": "test:data-validator",
      "kind": "INTERNAL",
      "startTime": 1703548800000,
      "endTime": 1703548800150,
      "duration": 150,
      "attributes": {
        "test.name": "data validator success case"
      },
      "status": { "code": "OK" },
      "events": []
    },
    {
      "traceId": "4bf92f3577b34da6a3ce929d0e0e4736",
      "spanId": "abc123def4567890",
      "parentSpanId": "00f067aa0ba902b7",
      "name": "validation.started",
      "kind": "INTERNAL",
      "startTime": 1703548800010,
      "endTime": 1703548800015,
      "duration": 5,
      "attributes": {
        "input.recordCount": 100,
        "input.source": "test-data.csv"
      },
      "status": { "code": "OK" },
      "events": []
    },
    {
      "traceId": "4bf92f3577b34da6a3ce929d0e0e4736",
      "spanId": "def789abc1234567",
      "parentSpanId": "00f067aa0ba902b7",
      "name": "validation.complete",
      "kind": "INTERNAL",
      "startTime": 1703548800140,
      "endTime": 1703548800145,
      "duration": 5,
      "attributes": {
        "result.validCount": 95,
        "result.invalidCount": 5,
        "duration.ms": 130
      },
      "status": { "code": "OK" },
      "events": []
    }
  ]
}

${chalk.bold('Next Steps:')}
  ${chalk.cyan('npx @principal-ai/principal-studio-cli validate')}          Validate canvas
  ${chalk.cyan('npx @principal-ai/principal-studio-cli workflow validate')} Validate workflows
  ${chalk.cyan('npx @principal-ai/principal-studio-cli validate-execution')}  Validate execution
`,
};

export function createFormatsCommand(): Command {
  const command = new Command('formats');

  command
    .description('Display documentation about file formats')
    .argument(
      '[section]',
      'Section to display: overview, canvas, workflow, execution, library, scopes, examples'
    )
    .action((section?: string) => {
      const validSections = Object.keys(FORMAT_SECTIONS);

      if (!section) {
        console.log(FORMAT_SECTIONS.overview);
        return;
      }

      const normalizedSection = section.toLowerCase();

      if (!validSections.includes(normalizedSection)) {
        console.log(chalk.red(`Unknown section: ${section}`));
        console.log(`Valid sections: ${validSections.join(', ')}`);
        process.exit(1);
      }

      console.log(FORMAT_SECTIONS[normalizedSection as keyof typeof FORMAT_SECTIONS]);
    });

  return command;
}
