#!/usr/bin/env bun

/**
 * Source Suggestion Script
 *
 * Suggests file sources for canvas nodes based on naming conventions
 */

import { readFile } from 'fs/promises';
import { glob } from 'glob';
import { relative, basename } from 'path';

interface CanvasNode {
  id: string;
  text?: string;
  pv?: {
    name?: string;
    nodeType?: string;
    sources?: string[];
  };
}

interface Canvas {
  nodes?: CanvasNode[];
}

interface Suggestion {
  canvasFile: string;
  nodeId: string;
  nodeName: string;
  suggestedFiles: string[];
  confidence: 'high' | 'medium' | 'low';
}

// Convert kebab-case to PascalCase
function toPascalCase(str: string): string {
  return str
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join('');
}

// Suggest files for a node based on naming heuristics
function suggestFilesForNode(nodeId: string, nodeName: string, allFiles: string[]): { files: string[]; confidence: 'high' | 'medium' | 'low' } {
  const suggestions: { file: string; score: number }[] = [];

  // Generate search variants
  const pascalCase = toPascalCase(nodeId);
  const variants = [
    pascalCase,
    nodeId,
    nodeId.replace(/-/g, ''),
    nodeName.replace(/\s+/g, ''),
  ];

  for (const file of allFiles) {
    const fileName = basename(file, '.ts');
    let score = 0;

    // Exact match
    if (variants.some(v => fileName.toLowerCase() === v.toLowerCase())) {
      score = 100;
    }
    // Partial match
    else if (variants.some(v => fileName.toLowerCase().includes(v.toLowerCase()))) {
      score = 50;
    }
    // Contains any word from node name
    else if (nodeName.split(/\s+/).some(word =>
      word.length > 3 && fileName.toLowerCase().includes(word.toLowerCase())
    )) {
      score = 25;
    }

    if (score > 0) {
      suggestions.push({ file, score });
    }
  }

  // Sort by score
  suggestions.sort((a, b) => b.score - a.score);

  const topFiles = suggestions.slice(0, 3).map(s => s.file);
  const confidence = suggestions.length > 0 && suggestions[0].score === 100
    ? 'high'
    : suggestions.length > 0 && suggestions[0].score >= 50
    ? 'medium'
    : 'low';

  return { files: topFiles, confidence };
}

async function generateSuggestions(rootDir: string): Promise<Suggestion[]> {
  // Find all source files
  const sourceFiles = await glob('packages/subsystems-core/src/**/*.ts', {
    cwd: rootDir,
    ignore: ['**/*.test.ts', '**/*.spec.ts', '**/*.d.ts']
  });

  // Find all canvas files
  const canvasFiles = await glob('**/*.otel.canvas', {
    cwd: rootDir,
    absolute: true,
    dot: true,
    ignore: ['**/node_modules/**']
  });

  const suggestions: Suggestion[] = [];

  for (const canvasPath of canvasFiles) {
    const content = await readFile(canvasPath, 'utf-8');
    const canvas: Canvas = JSON.parse(content);

    if (!canvas.nodes) continue;

    for (const node of canvas.nodes) {
      // Skip if already has sources
      if (node.pv?.sources && node.pv.sources.length > 0) continue;

      const nodeName = node.pv?.name || node.text?.split('\n')[0].replace('#', '').trim() || node.id;
      const { files, confidence } = suggestFilesForNode(node.id, nodeName, sourceFiles);

      suggestions.push({
        canvasFile: relative(rootDir, canvasPath),
        nodeId: node.id,
        nodeName,
        suggestedFiles: files,
        confidence
      });
    }
  }

  return suggestions;
}

function printSuggestions(suggestions: Suggestion[]): void {
  console.log('\n' + '='.repeat(70));
  console.log('🔗 SOURCE SUGGESTIONS');
  console.log('='.repeat(70));

  // Group by canvas file
  const byCanvas = suggestions.reduce((acc, s) => {
    if (!acc[s.canvasFile]) acc[s.canvasFile] = [];
    acc[s.canvasFile].push(s);
    return acc;
  }, {} as Record<string, Suggestion[]>);

  for (const [canvasFile, nodeSuggestions] of Object.entries(byCanvas)) {
    console.log(`\n📋 ${canvasFile}`);
    console.log('-'.repeat(70));

    for (const suggestion of nodeSuggestions) {
      const icon = suggestion.confidence === 'high' ? '✅' : suggestion.confidence === 'medium' ? '🟡' : '❓';
      console.log(`\n  ${icon} Node: ${suggestion.nodeId} (${suggestion.nodeName})`);

      if (suggestion.suggestedFiles.length > 0) {
        console.log(`     Suggested files:`);
        suggestion.suggestedFiles.forEach(f => {
          console.log(`     - ${f}`);
        });
      } else {
        console.log(`     No matching files found - may need manual mapping`);
      }
    }
  }

  console.log('\n' + '='.repeat(70));
  console.log('\n💡 Usage: Add sources to your canvas nodes like this:\n');
  console.log('  "pv": {');
  console.log('    "sources": ["packages/subsystems-core/src/utils/GraphConverter.ts"]');
  console.log('  }\n');
  console.log('Legend:');
  console.log('  ✅ High confidence - exact or very close match');
  console.log('  🟡 Medium confidence - partial match');
  console.log('  ❓ Low confidence - weak or no match');
  console.log('\n' + '='.repeat(70) + '\n');
}

// Main execution
const rootDir = process.cwd();
const suggestions = await generateSuggestions(rootDir);
printSuggestions(suggestions);
