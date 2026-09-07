/**
 * Setup command - Display setup guides for configuring Principal View features
 */

import { Command } from 'commander';
import chalk from 'chalk';

const SETUP_SECTIONS = {
  overview: `
${chalk.bold.cyan('Principal View Setup Guides')}
${chalk.dim('═'.repeat(70))}

Setup guides help you configure Principal View features in your project.

Run ${chalk.cyan('principal-ai setup <topic>')} for detailed setup instructions:

  ${chalk.yellow('telemetry-routing')}   Configure OTEL traces to route to storyboards
  ${chalk.yellow('test-otel')}           Set up OpenTelemetry for test environments
  ${chalk.yellow('storybook-otel')}      Set up OpenTelemetry for Storybook

${chalk.bold('Quick Start:')}
  ${chalk.dim('1.')} Run ${chalk.cyan('principal-ai init')} to create .principal-views/ directory
  ${chalk.dim('2.')} Run ${chalk.cyan('principal-ai setup telemetry-routing')} to configure trace routing
  ${chalk.dim('3.')} Run ${chalk.cyan('principal-ai doctor')} to verify your configuration
`,

  'telemetry-routing': `
${chalk.bold.cyan('Configuring Telemetry Routing')}
${chalk.dim('═'.repeat(70))}

This guide explains how to configure your project so that OpenTelemetry traces
route correctly to storyboards in the dev workspace.

${chalk.bold('Prerequisites')}
${chalk.dim('─'.repeat(70))}
  • An existing ${chalk.yellow('.principal-views/')} directory with ${chalk.yellow('library.yaml')}
  • At least one ${chalk.yellow('.otel.canvas')} and ${chalk.yellow('.workflow.json')} file
  • A running OTEL collector (local dev workspace)

${chalk.bold('Key Concepts')}
${chalk.dim('─'.repeat(70))}

${chalk.cyan('Instrumentation Scope')}
  The name passed to ${chalk.dim('trace.getTracer()')}. For library instrumentation,
  this is typically the package name:

  ${chalk.dim('// In your library\'s telemetry.ts')}
  ${chalk.green('export const')} TRACER_NAME = ${chalk.yellow('"@my-org/my-library"')};

  ${chalk.green('export function')} getTracer(): Tracer {
    ${chalk.green('return')} trace.getTracer(TRACER_NAME, TRACER_VERSION);
  }

${chalk.cyan('Scope Ownership')}
  The dev workspace needs to know which service "owns" which instrumentation
  scope. This is how it routes traces from a library to the correct storyboards.

  Example:
  • Library ${chalk.yellow('@backlog-md/core')} emits traces with scope ${chalk.yellow('@backlog-md/core')}
  • Test service ${chalk.yellow('@backlog-md/core-test')} declares it owns scope ${chalk.yellow('@backlog-md/core')}
  • Dev workspace routes traces from that scope to storyboards in the library repo

${chalk.bold('Step 1: Add scope to workflow.json')}
${chalk.dim('─'.repeat(70))}

Each workflow file needs to declare which instrumentation scope it handles:

  {
    ${chalk.green('"version"')}: "1.0.0",
    ${chalk.green('"canvas"')}: ".principal-views/my-feature/my-feature.otel.canvas",
    ${chalk.yellow('"scope"')}: "@my-org/my-library",  ${chalk.dim('← Must match TRACER_NAME')}
    ${chalk.green('"name"')}: "My Feature",
    ${chalk.green('"spanPattern"')}: "my-feature.operation",
    ${chalk.green('"scenarios"')}: [...]
  }

${chalk.bold('Step 2: Configure library.yaml Resources')}
${chalk.dim('─'.repeat(70))}

Add a ${chalk.yellow('resources')} section to ${chalk.yellow('library.yaml')} with your test/storybook services:

  ${chalk.green('version')}: "1.0.0"
  ${chalk.green('name')}: "@my-org/my-library"
  ${chalk.green('description')}: "My library description"

  ${chalk.yellow('resources')}:
    ${chalk.cyan('my-library-test')}:
      service.name: "@my-org/my-library-test"
      service.version: "1.0.0"
      deployment.environment: "test"
      test.framework: "bun"
      ${chalk.yellow('owned-scopes')}:
        - "@my-org/my-library"  ${chalk.dim('← Links service to library scope')}

  nodeComponents: {}
  edgeComponents: {}

${chalk.bold('Step 3: Match Service Name in Test Setup')}
${chalk.dim('─'.repeat(70))}

Your test OTEL setup must use the same ${chalk.yellow('service.name')} declared in library.yaml:

  ${chalk.dim('// src/test/otel-setup.ts')}
  ${chalk.green('const')} resource = resourceFromAttributes({
    [ATTR_SERVICE_NAME]: ${chalk.yellow('"@my-org/my-library-test"')},  ${chalk.dim('← Must match')}
    [ATTR_SERVICE_VERSION]: "1.0.0",
    [ATTR_DEPLOYMENT_ENVIRONMENT]: "test",
  });

${chalk.bold('How Routing Works')}
${chalk.dim('─'.repeat(70))}

  ${chalk.cyan('1.')} Trace arrives at dev workspace with:
     • ${chalk.yellow('service.name')} from resource attributes (e.g., @my-org/my-library-test)
     • Instrumentation scope from span (e.g., @my-org/my-library)

  ${chalk.cyan('2.')} Dev workspace looks up the service in all library.yaml files:
     • Finds resource with matching service.name
     • Checks owned-scopes for the instrumentation scope

  ${chalk.cyan('3.')} Storyboard matching uses scope field in workflow.json:
     • Finds workflows where scope matches the instrumentation scope
     • Matches spanPattern to find the right workflow
     • Applies scenario templates to render the trace

${chalk.bold('Validation')}
${chalk.dim('─'.repeat(70))}

  ${chalk.cyan('principal-ai validate')}                    ${chalk.dim('# Validate all principal-view files')}
  ${chalk.cyan('principal-ai validate library.yaml')}       ${chalk.dim('# Validate just the library')}

${chalk.bold('Troubleshooting')}
${chalk.dim('─'.repeat(70))}

${chalk.red('"No storyboards found for scope"')}
  Check:
  ${chalk.dim('1.')} ${chalk.yellow('scope')} field in workflow.json matches your TRACER_NAME
  ${chalk.dim('2.')} ${chalk.yellow('owned-scopes')} in library.yaml resource includes your library scope
  ${chalk.dim('3.')} ${chalk.yellow('service.name')} in your OTEL setup matches library.yaml resource

${chalk.red('Traces arrive but don\'t match scenarios')}
  Check:
  ${chalk.dim('1.')} ${chalk.yellow('spanPattern')} in workflow.json matches your span names
  ${chalk.dim('2.')} Events in ${chalk.yellow('template.events')} match event names emitted by your code

${chalk.red('Validation errors on library.yaml')}
  Check:
  ${chalk.dim('1.')} ${chalk.yellow('owned-scopes')} is nested inside a resource entry, not at root level
  ${chalk.dim('2.')} All required fields are present: version, name, description, resources,
     nodeComponents, edgeComponents

${chalk.bold('Related')}
${chalk.dim('─'.repeat(70))}
  ${chalk.cyan('principal-ai setup test-otel')}         Detailed test OTEL setup
  ${chalk.cyan('principal-ai setup storybook-otel')}    Storybook addon setup
  ${chalk.cyan('principal-ai formats library')}         library.yaml format reference
  ${chalk.cyan('principal-ai formats workflow')}        workflow.json format reference
`,

  'test-otel': `
${chalk.bold.cyan('Setting Up OpenTelemetry for Tests')}
${chalk.dim('═'.repeat(70))}

This guide covers setting up OpenTelemetry in test environments (bun, vitest, jest)
to emit traces that route to your storyboards.

${chalk.bold('Dependencies')}
${chalk.dim('─'.repeat(70))}

  ${chalk.dim('# Runtime dependency (library instrumentation)')}
  ${chalk.cyan('bun add @opentelemetry/api')}

  ${chalk.dim('# Dev dependencies (test infrastructure)')}
  ${chalk.cyan('bun add -d @opentelemetry/sdk-trace-node \\')}
  ${chalk.cyan('           @opentelemetry/exporter-trace-otlp-http \\')}
  ${chalk.cyan('           @opentelemetry/resources \\')}
  ${chalk.cyan('           @opentelemetry/semantic-conventions')}

${chalk.bold('OTEL Setup Module')}
${chalk.dim('─'.repeat(70))}

Create ${chalk.yellow('src/test/otel-setup.ts')}:

  ${chalk.green('import')} { OTLPTraceExporter } ${chalk.green('from')} "@opentelemetry/exporter-trace-otlp-http";
  ${chalk.green('import')} { resourceFromAttributes } ${chalk.green('from')} "@opentelemetry/resources";
  ${chalk.green('import')} { NodeTracerProvider } ${chalk.green('from')} "@opentelemetry/sdk-trace-node";
  ${chalk.green('import')} { SimpleSpanProcessor } ${chalk.green('from')} "@opentelemetry/sdk-trace-base";
  ${chalk.green('import')} {
    ATTR_SERVICE_NAME,
    ATTR_SERVICE_VERSION,
    ATTR_DEPLOYMENT_ENVIRONMENT,
  } ${chalk.green('from')} "@opentelemetry/semantic-conventions";

  ${chalk.green('let')} tracerProvider: NodeTracerProvider | ${chalk.green('null')} = ${chalk.green('null')};

  ${chalk.green('export interface')} OTELSetupOptions {
    serviceName?: ${chalk.green('string')};
    serviceVersion?: ${chalk.green('string')};
    endpoint?: ${chalk.green('string')};
  }

  ${chalk.green('export async function')} setupOTEL(options: OTELSetupOptions = {}): Promise<${chalk.green('void')}> {
    ${chalk.green('const')} endpoint = options.endpoint ?? "http://localhost:4318/v1/traces";
    ${chalk.green('const')} serviceName = options.serviceName ?? "@my-org/my-library-test";
    ${chalk.green('const')} serviceVersion = options.serviceVersion ?? "1.0.0";

    ${chalk.green('const')} exporter = ${chalk.green('new')} OTLPTraceExporter({ url: endpoint });

    ${chalk.green('const')} resource = resourceFromAttributes({
      [ATTR_SERVICE_NAME]: serviceName,
      [ATTR_SERVICE_VERSION]: serviceVersion,
      [ATTR_DEPLOYMENT_ENVIRONMENT]: "test",
    });

    tracerProvider = ${chalk.green('new')} NodeTracerProvider({
      resource,
      spanProcessors: [${chalk.green('new')} SimpleSpanProcessor(exporter)],
    });

    tracerProvider.register();
    console.log(\`[OTEL] Initialized, exporting to \${endpoint}\`);
  }

  ${chalk.green('export async function')} flushOTEL(): Promise<${chalk.green('void')}> {
    ${chalk.green('if')} (tracerProvider) {
      ${chalk.green('await')} tracerProvider.forceFlush();
    }
  }

  ${chalk.green('export async function')} shutdownOTEL(): Promise<${chalk.green('void')}> {
    ${chalk.green('if')} (tracerProvider) {
      ${chalk.green('await')} tracerProvider.shutdown();
      tracerProvider = ${chalk.green('null')};
      console.log("[OTEL] Tracer provider shut down");
    }
  }

${chalk.bold('Integration Test Example')}
${chalk.dim('─'.repeat(70))}

  ${chalk.dim('// src/test/my-feature.otel.test.ts')}
  ${chalk.green('import')} { describe, test, expect, beforeAll, afterAll } ${chalk.green('from')} "bun:test";
  ${chalk.green('import')} { setupOTEL, shutdownOTEL, flushOTEL } ${chalk.green('from')} "./otel-setup";
  ${chalk.green('import')} { MyLibrary } ${chalk.green('from')} "../index";

  describe("My feature telemetry", () => {
    beforeAll(${chalk.green('async')} () => {
      ${chalk.green('await')} setupOTEL({
        serviceName: "@my-org/my-library-test",
      });
    });

    afterAll(${chalk.green('async')} () => {
      ${chalk.green('await')} shutdownOTEL();
    });

    test("emits telemetry events on success", ${chalk.green('async')} () => {
      ${chalk.green('const')} lib = ${chalk.green('new')} MyLibrary();
      ${chalk.green('await')} lib.doSomething();

      ${chalk.dim('// Flush to ensure traces are sent before test ends')}
      ${chalk.green('await')} flushOTEL();

      expect(${chalk.green('true')}).toBe(${chalk.green('true')});
    });
  });

${chalk.bold('library.yaml Configuration')}
${chalk.dim('─'.repeat(70))}

Add a resource entry for your test service:

  ${chalk.green('resources')}:
    ${chalk.cyan('my-library-test')}:
      service.name: "@my-org/my-library-test"  ${chalk.dim('← Must match setupOTEL')}
      service.version: "1.0.0"
      deployment.environment: "test"
      test.framework: "bun"
      ${chalk.yellow('owned-scopes')}:
        - "@my-org/my-library"

${chalk.bold('Related')}
${chalk.dim('─'.repeat(70))}
  ${chalk.cyan('principal-ai setup telemetry-routing')}   Full routing configuration
  ${chalk.cyan('principal-ai setup storybook-otel')}      Storybook setup
`,

  'storybook-otel': `
${chalk.bold.cyan('Setting Up OpenTelemetry for Storybook')}
${chalk.dim('═'.repeat(70))}

For Storybook, use the ${chalk.yellow('@principal-ai/storybook-otel-addon')} which handles
OTEL setup automatically.

${chalk.bold('Dependencies')}
${chalk.dim('─'.repeat(70))}

  ${chalk.cyan('bun add -d @principal-ai/storybook-otel-addon')}

${chalk.bold('Storybook Configuration')}
${chalk.dim('─'.repeat(70))}

Add the addon in ${chalk.yellow('.storybook/main.ts')}:

  ${chalk.green('import type')} { StorybookConfig } ${chalk.green('from')} "@storybook/react-vite";

  ${chalk.green('const')} config: StorybookConfig = {
    ${chalk.dim('// ... other config')}
    addons: [
      "@storybook/addon-essentials",
      ${chalk.yellow('"@principal-ai/storybook-otel-addon"')},
    ],
  };

  ${chalk.green('export default')} config;

${chalk.bold('Configure Addon')}
${chalk.dim('─'.repeat(70))}

Set OTEL parameters in ${chalk.yellow('.storybook/preview.ts')}:

  ${chalk.green('import type')} { Preview } ${chalk.green('from')} "@storybook/react";

  ${chalk.green('const')} preview: Preview = {
    parameters: {
      ${chalk.yellow('otel')}: {
        ${chalk.dim('// Must match library.yaml resources entry')}
        serviceName: "my-library-storybook",
        serviceVersion: "1.0.0",
        environment: "development",
        endpoint: "http://localhost:4318/v1/traces",
      },
    },
  };

  ${chalk.green('export default')} preview;

${chalk.bold('library.yaml Configuration')}
${chalk.dim('─'.repeat(70))}

Add a resource entry for your Storybook service:

  ${chalk.green('resources')}:
    ${chalk.cyan('my-library-storybook')}:
      service.name: "my-library-storybook"  ${chalk.dim('← Must match preview.ts')}
      service.version: "1.0.0"
      deployment.environment: "development"
      project: "my-library"
      ${chalk.yellow('owned-scopes')}:
        - "@my-org/my-library"

${chalk.bold('Complete library.yaml Example')}
${chalk.dim('─'.repeat(70))}

With both test and Storybook services:

  ${chalk.green('version')}: "1.0.0"
  ${chalk.green('name')}: "@my-org/my-library"
  ${chalk.green('description')}: "My library description"

  ${chalk.green('resources')}:
    ${chalk.dim('# Test service - used by bun test / vitest / jest')}
    ${chalk.cyan('my-library-test')}:
      service.name: "@my-org/my-library-test"
      service.version: "1.0.0"
      deployment.environment: "test"
      test.framework: "bun"
      library.name: "@my-org/my-library"
      owned-scopes:
        - "@my-org/my-library"

    ${chalk.dim('# Storybook service - used by storybook addon')}
    ${chalk.cyan('my-library-storybook')}:
      service.name: "my-library-storybook"
      service.version: "1.0.0"
      deployment.environment: "development"
      project: "my-library"
      owned-scopes:
        - "@my-org/my-library"

  nodeComponents: {}
  edgeComponents: {}

${chalk.bold('Related')}
${chalk.dim('─'.repeat(70))}
  ${chalk.cyan('principal-ai setup telemetry-routing')}   Full routing configuration
  ${chalk.cyan('principal-ai setup test-otel')}           Test environment setup
`,
};

export function createSetupCommand(): Command {
  const command = new Command('setup');

  command
    .description('Display setup guides for configuring Principal View features')
    .argument('[topic]', 'Topic to display: telemetry-routing, test-otel, storybook-otel')
    .action((topic?: string) => {
      const validTopics = Object.keys(SETUP_SECTIONS).filter((k) => k !== 'overview');

      if (!topic) {
        console.log(SETUP_SECTIONS.overview);
        return;
      }

      const normalizedTopic = topic.toLowerCase();

      if (!Object.keys(SETUP_SECTIONS).includes(normalizedTopic)) {
        console.log(chalk.red(`Unknown topic: ${topic}`));
        console.log(`\nAvailable topics: ${validTopics.join(', ')}`);
        console.log(`\nRun ${chalk.cyan('principal-ai setup')} to see all available guides.`);
        process.exit(1);
      }

      console.log(SETUP_SECTIONS[normalizedTopic as keyof typeof SETUP_SECTIONS]);
    });

  return command;
}
