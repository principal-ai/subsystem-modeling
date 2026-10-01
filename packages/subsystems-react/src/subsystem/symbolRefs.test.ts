import { describe, expect, test } from 'bun:test';
import type { GraphifyComponentDetail } from '../graphify';
import {
  extractDeclarationSymbolRefs,
  isLimitedInspection,
  type SymbolInspection,
} from './symbolRefs';

function names(declaration: GraphifyComponentDetail | undefined): string[] {
  return extractDeclarationSymbolRefs(declaration)
    .map((r) => r.name)
    .sort();
}

describe('extractDeclarationSymbolRefs — function', () => {
  test('keeps named types (bare or nested), drops primitives', () => {
    const declaration: GraphifyComponentDetail = {
      kind: 'function',
      parameters: [
        { name: 'session', type: 'SessionRecord' },
        { name: 'limit', type: 'number' },
        { name: 'options', type: 'Required<ProcessingOptions>' },
      ],
      returnType: 'SessionEvent[]',
    };
    expect(names(declaration)).toEqual([
      'ProcessingOptions',
      'SessionEvent',
      'SessionRecord',
    ]);
  });

  test('surfaces named types nested in composite types', () => {
    const declaration: GraphifyComponentDetail = {
      kind: 'function',
      parameters: [
        { name: 'doc', type: 'SubsystemModelDocument' },
        { name: 'opts', type: '{ maxNodeWidth?: number } & BoundaryFrameOptions' },
      ],
      returnType: 'Promise<{ nodes: SubsystemGraphNode[]; edges: SubsystemGraphEdge[] }>',
      callers: [],
      callees: [],
    };
    expect(names(declaration)).toEqual([
      'BoundaryFrameOptions',
      'SubsystemGraphEdge',
      'SubsystemGraphNode',
      'SubsystemModelDocument',
    ]);
  });

  test('drops global/ambient types (JSX.Element, Promise, …)', () => {
    const declaration: GraphifyComponentDetail = {
      kind: 'function',
      parameters: [{ name: 'props', type: 'PierreSnippetViewProps' }],
      returnType: 'JSX.Element',
      callers: [],
      callees: [],
    };
    expect(names(declaration)).toEqual(['PierreSnippetViewProps']);
  });

  test('carries the reference nodeId/context through', () => {
    const declaration: GraphifyComponentDetail = {
      kind: 'function',
      parameters: [
        {
          name: 'session',
          type: 'SessionRecord',
          ref: { nodeId: 'n1', name: 'SessionRecord', context: 'parameter_type' },
        },
      ],
    };
    const refs = extractDeclarationSymbolRefs(declaration);
    expect(refs).toHaveLength(1);
    expect(refs[0]).toMatchObject({
      name: 'SessionRecord',
      nodeId: 'n1',
      context: 'parameter_type',
    });
  });
});

describe('extractDeclarationSymbolRefs — class', () => {
  test('collects params, returns, extends, implements and references', () => {
    const declaration: GraphifyComponentDetail = {
      kind: 'class',
      methods: [
        {
          nodeId: 'm1',
          name: 'process',
          parameters: [{ name: 'event', type: 'RawEvent' }],
          returnType: 'ProcessedEvent',
        },
      ],
      properties: [{ name: 'options', type: 'ProcessingOptions' }],
      extends: ['BaseProcessor'],
      implements: ['Disposable', 'EventEmitterLike'],
      references: [{ nodeId: 'n-emitter', name: 'EventEmitterLike', context: 'type' }],
    };
    expect(names(declaration)).toEqual([
      'BaseProcessor',
      'Disposable',
      'EventEmitterLike',
      'ProcessedEvent',
      'ProcessingOptions',
      'RawEvent',
    ]);
  });
});

describe('extractDeclarationSymbolRefs — type', () => {
  test('collects property, alias and union members', () => {
    const declaration: GraphifyComponentDetail = {
      kind: 'type',
      properties: [{ name: 'id', type: 'BrandedId' }],
      aliasOf: 'ServerSessionRow',
      unionOf: ["'started'", 'StoppedState'],
    };
    expect(names(declaration)).toEqual([
      'BrandedId',
      'ServerSessionRow',
      'StoppedState',
    ]);
  });

  test('undefined declaration yields no refs', () => {
    expect(extractDeclarationSymbolRefs(undefined)).toEqual([]);
  });
});

describe('isLimitedInspection', () => {
  const declaration: GraphifyComponentDetail = {
    kind: 'type',
    properties: [{ name: 'id', type: 'string' }],
  };

  test('a declaration is not limited', () => {
    expect(
      isLimitedInspection({ symbol: 'X', resolution: 'resolved', declaration }),
    ).toBe(false);
  });

  test('no declaration is limited, regardless of resolution', () => {
    expect(isLimitedInspection({ symbol: 'X', resolution: 'resolved' })).toBe(true);
    expect(isLimitedInspection({ symbol: 'X', resolution: 'ambiguous' })).toBe(true);
    expect(isLimitedInspection({ symbol: 'X', resolution: 'unresolved' })).toBe(true);
    expect(isLimitedInspection({ symbol: 'X', resolution: 'missing' })).toBe(true);
    expect(isLimitedInspection(null)).toBe(true);
  });
});
