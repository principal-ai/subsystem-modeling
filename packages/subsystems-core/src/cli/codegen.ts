#!/usr/bin/env node
/**
 * Code Generation CLI
 *
 * Generate types from canvas files.
 *
 * Usage:
 *   npx @principal-ai/subsystems-core codegen my-flow.canvas
 *   npx @principal-ai/subsystems-core codegen --lang typescript --output types/ my-flow.canvas
 *
 * Similar to:
 *   - graphql-codegen (GraphQL)
 *   - openapi-generator (OpenAPI)
 *   - protoc (Protobuf)
 */

import fs from 'fs';
import path from 'path';
import { generateTypes, generatorRegistry } from '../codegen/type-generator';
import type { ExtendedCanvas } from '../types/canvas';
import type { CodegenOptions } from '../codegen/type-generator';

interface CliOptions {
  language: 'typescript' | 'python' | 'go' | 'rust';
  output?: string;
  readonly?: boolean;
  strictNullChecks?: boolean;
  includeDocComments?: boolean;
  namespace?: string;
  watch?: boolean;
}

/**
 * Parse command line arguments
 */
function parseArgs(args: string[]): { options: CliOptions; canvasFiles: string[] } {
  const options: CliOptions = {
    language: 'typescript',
    includeDocComments: true,
    strictNullChecks: true,
  };

  const canvasFiles: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    switch (arg) {
      case '--lang':
      case '-l':
        options.language = args[++i] as CliOptions['language'];
        break;
      case '--output':
      case '-o':
        options.output = args[++i];
        break;
      case '--readonly':
        options.readonly = true;
        break;
      case '--no-strict-null-checks':
        options.strictNullChecks = false;
        break;
      case '--no-doc-comments':
        options.includeDocComments = false;
        break;
      case '--namespace':
      case '-n':
        options.namespace = args[++i];
        break;
      case '--watch':
      case '-w':
        options.watch = true;
        break;
      case '--help':
      case '-h':
        printHelp();
        process.exit(0);
        break;
      case '--list-generators':
        listGenerators();
        process.exit(0);
        break;
      default:
        if (!arg.startsWith('--')) {
          canvasFiles.push(arg);
        }
    }
  }

  return { options, canvasFiles };
}

/**
 * Generate types for a canvas file
 */
function generateTypesForFile(canvasPath: string, options: CliOptions) {
  console.log(`📝 Generating types from ${canvasPath}...`);

  // Read canvas file
  const canvas: ExtendedCanvas = JSON.parse(fs.readFileSync(canvasPath, 'utf-8'));

  // Generate types
  const codegenOptions: CodegenOptions = {
    language: options.language,
    style: {
      readonly: options.readonly,
      strictNullChecks: options.strictNullChecks,
      includeDocComments: options.includeDocComments,
    },
    namespace: options.namespace,
  };

  const result = generateTypes(canvas, codegenOptions);

  // Determine output path
  let outputPath: string;
  if (options.output) {
    // If output is a directory, use generated filename
    if (fs.existsSync(options.output) && fs.statSync(options.output).isDirectory()) {
      outputPath = path.join(options.output, result.filename);
    } else {
      outputPath = options.output;
    }
  } else {
    // Default: packages/subsystems-core/src/generated/ for .principal-views canvases
    // This keeps canvas files in .principal-views/ but generates types to idiomatic locations
    const canvasDir = path.dirname(canvasPath);
    const canvasAbsPath = path.resolve(canvasPath);

    if (canvasAbsPath.includes('.principal-views')) {
      // Canvas is in .principal-views/, output to packages/subsystems-core/src/generated/
      const repoRoot = canvasAbsPath.split('.principal-views')[0];
      const generatedDir = path.join(repoRoot, 'packages', 'core', 'src', 'generated');
      outputPath = path.join(generatedDir, result.filename);
    } else {
      // Canvas is elsewhere, use same directory
      outputPath = path.join(canvasDir, result.filename);
    }
  }

  // Ensure output directory exists
  const outputDir = path.dirname(outputPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Write types file
  fs.writeFileSync(outputPath, result.code);

  console.log(`✅ Generated ${outputPath}`);
  console.log(`   Language: ${options.language}`);
  console.log(`   Size: ${result.code.length} bytes`);

  return outputPath;
}

/**
 * Print help message
 */
function printHelp() {
  console.log(`
Code Generation CLI - Generate types from canvas files

USAGE:
  npx @principal-ai/subsystems-core codegen [OPTIONS] <canvas-files...>

OPTIONS:
  -l, --lang <language>           Target language (typescript|python|go|rust) [default: typescript]
  -o, --output <path>             Output file or directory [default: same as canvas]
  -n, --namespace <name>          Wrap types in a namespace
  --readonly                      Use readonly modifiers (TypeScript)
  --no-strict-null-checks         Disable strict null checks
  --no-doc-comments               Omit JSDoc comments
  -w, --watch                     Watch for changes and regenerate
  --list-generators               List available code generators
  -h, --help                      Show this help message

EXAMPLES:
  # Generate TypeScript types
  npx @principal-ai/subsystems-core codegen my-flow.canvas

  # Generate with namespace
  npx @principal-ai/subsystems-core codegen --namespace Events my-flow.canvas

  # Generate to specific output directory
  npx @principal-ai/subsystems-core codegen --output src/types/ my-flow.canvas

  # Generate multiple files
  npx @principal-ai/subsystems-core codegen *.canvas

  # Watch mode (future)
  npx @principal-ai/subsystems-core codegen --watch my-flow.canvas

PRECEDENTS:
  This tool follows patterns from:
  - GraphQL Code Generator (graphql-code-generator.com)
  - OpenAPI Generator (openapi-generator.tech)
  - Protobuf Compiler (protoc)

  Like these tools, it generates type-safe code from declarative schemas.
`);
}

/**
 * List available generators
 */
function listGenerators() {
  console.log('\nAvailable Code Generators:\n');

  const languages = generatorRegistry.list();

  for (const lang of languages) {
    const generator = generatorRegistry.get(lang);
    console.log(`  • ${lang.padEnd(15)} ${generator ? '✓' : '✗'}`);
  }

  console.log('\nTo add support for more languages, implement the CodeGenerator interface.');
  console.log('See: packages/subsystems-core/src/codegen/type-generator.ts\n');
}

/**
 * Main entry point
 */
function main() {
  const { options, canvasFiles } = parseArgs(process.argv.slice(2));

  if (canvasFiles.length === 0) {
    console.error('❌ Error: No canvas files specified\n');
    printHelp();
    process.exit(1);
  }

  // Validate language
  const availableLanguages = generatorRegistry.list();
  if (!availableLanguages.includes(options.language)) {
    console.error(`❌ Error: Unsupported language '${options.language}'`);
    console.error(`   Available: ${availableLanguages.join(', ')}\n`);
    listGenerators();
    process.exit(1);
  }

  // Generate types for each file
  const outputFiles: string[] = [];

  for (const canvasFile of canvasFiles) {
    try {
      // Check if file exists
      if (!fs.existsSync(canvasFile)) {
        console.error(`❌ Error: File not found: ${canvasFile}`);
        continue;
      }

      const outputPath = generateTypesForFile(canvasFile, options);
      outputFiles.push(outputPath);
    } catch (error) {
      console.error(`❌ Error processing ${canvasFile}:`, error);
      process.exit(1);
    }
  }

  console.log(`\n✨ Successfully generated ${outputFiles.length} type file(s)\n`);

  // Watch mode
  if (options.watch) {
    console.log('👀 Watching for changes...');
    for (const canvasFile of canvasFiles) {
      fs.watch(canvasFile, (eventType) => {
        if (eventType === 'change') {
          console.log(`\n🔄 ${canvasFile} changed, regenerating...`);
          try {
            generateTypesForFile(canvasFile, options);
          } catch (error) {
            console.error('❌ Error:', error);
          }
        }
      });
    }
  }
}

// Run CLI if executed directly
if (require.main === module) {
  main();
}

export { main, parseArgs, generateTypesForFile };
