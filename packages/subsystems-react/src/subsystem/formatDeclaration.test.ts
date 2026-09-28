import { describe, expect, test } from 'bun:test';
import { generateDeclarationString, resolveComponentDeclaration } from './formatDeclaration';
import type { SubsystemComponent } from './model';

describe('generateDeclarationString — store', () => {
  const base: Omit<SubsystemComponent, 'declaration'> = {
    id: 'st',
    name: 'feeds',
    construct: 'store',
    symbol: 'feeds',
    file: 'src/live.ts',
    purl: 'pkg:github/acme/app',
  };

  test('renders a declared valueType as the store signature', () => {
    const component: SubsystemComponent = {
      ...base,
      declaration: {
        kind: 'store',
        storage: 'memory',
        properties: [],
        valueType: 'Map<string, OpencodeLiveFeedState>',
      },
    };
    expect(generateDeclarationString(component)).toBe(
      '// store: feeds — Map<string, OpencodeLiveFeedState>\n// backing: memory',
    );
  });

  test('named members render as a body under the valueType', () => {
    const component: SubsystemComponent = {
      ...base,
      declaration: {
        kind: 'store',
        storage: 'memory',
        valueType: 'Map<string, { width: number }>',
        properties: [{ name: 'current', type: 'Map<string, { width: number }>' }],
      },
    };
    expect(generateDeclarationString(component)).toBe(
      '// store: feeds — Map<string, { width: number }>\n// backing: memory\n  current: Map<string, { width: number }>;',
    );
  });

  test('members without a valueType still render as declare const lines', () => {
    const component: SubsystemComponent = {
      ...base,
      declaration: {
        kind: 'store',
        properties: [{ name: 'ROOT', type: 'string' }],
      },
    };
    expect(generateDeclarationString(component)).toBe(
      '// store: feeds\ndeclare const ROOT: string;',
    );
  });

  test('a store with neither valueType nor members says so explicitly', () => {
    const component: SubsystemComponent = {
      ...base,
      declaration: { kind: 'store', storage: 'memory', properties: [] },
    };
    expect(generateDeclarationString(component)).toBe(
      '// store: feeds — no declared type (no valueType or state members)\n// backing: memory',
    );
  });
});

describe('generateDeclarationString — custom_entity', () => {
  test('renders entity identity + entityKind, no attributes when none authored', () => {
    const component: SubsystemComponent = {
      id: 'ct',
      name: 'FacilitiesTechnician',
      construct: 'custom_entity',
      entityKind: 'Person',
      file: '',
      purl: 'pkg:github/novatech/facilities-ops',
    };
    expect(generateDeclarationString(component)).toBe(
      "entity 'FacilitiesTechnician' — Person",
    );
  });

  test('renders authored attributes as indented key: value lines', () => {
    const component: SubsystemComponent = {
      id: 'ct',
      name: 'OpsInsightAgent',
      construct: 'custom_entity',
      entityKind: 'agent',
      file: '',
      purl: 'pkg:github/novatech/facilities-ops',
      declaration: {
        kind: 'custom_entity',
        attributes: [
          { key: 'slack', value: 'novatech/facilities-ops' },
          { key: 'permission', value: 'propose-only' },
        ],
      },
    };
    expect(generateDeclarationString(component)).toBe(
      "entity 'OpsInsightAgent' — agent\n  slack: novatech/facilities-ops\n  permission: propose-only",
    );
  });
});

describe('generateDeclarationString — type family', () => {
  const typed = (declaration: SubsystemComponent['declaration'], construct: SubsystemComponent['construct'] = 'type_alias') => {
    const component: SubsystemComponent = {
      id: 't',
      name: 'StudioMessageSubscriber',
      symbol: 'StudioMessageSubscriber',
      construct,
      file: 'packages/subsystems-studio/src/mainview/rpc.ts',
      purl: 'pkg:github/principal-ai/subsystem-modeling',
      declaration,
    };
    return generateDeclarationString(component);
  };

  test('generic callable alias renders its signature, not `= unknown`', () => {
    expect(
      typed({
        kind: 'type',
        generics: [{ name: 'K', constraint: 'keyof StudioMessages' }],
        signature: {
          parameters: [{ name: 'payload', type: 'StudioMessages[K]' }],
          returnType: 'void',
        },
      }),
    ).toBe('type StudioMessageSubscriber<K extends keyof StudioMessages> = (payload: StudioMessages[K]) => void;');
  });

  test('plain callable alias defaults return type to void', () => {
    expect(
      typed({
        kind: 'type',
        signature: { parameters: [{ name: 'req', type: 'Request' }] },
      }),
    ).toBe('type StudioMessageSubscriber = (req: Request) => void;');
  });

  test('rhs override wins over the structured shapes', () => {
    expect(
      typed({
        kind: 'type',
        properties: [{ name: 'id', type: 'string' }],
        rhs: '{ [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] }',
      }),
    ).toBe('type StudioMessageSubscriber = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] };');
  });

  test('generic + rhs render the type parameters in the header', () => {
    expect(
      typed({
        kind: 'type',
        generics: [{ name: 'T' }],
        rhs: '{ [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] }',
      }),
    ).toBe('type StudioMessageSubscriber<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] };');
  });

  test('plain reference alias renders through aliasOf', () => {
    expect(typed({ kind: 'type', aliasOf: 'ServerSessionRow[]' })).toBe(
      'type StudioMessageSubscriber = ServerSessionRow[];',
    );
  });

  test('union alias joins its alternatives', () => {
    expect(
      typed({ kind: 'type', unionOf: ["'idle'", "'busy'", "'error'"] }),
    ).toBe("type StudioMessageSubscriber = 'idle' | 'busy' | 'error';");
  });

  test('enum renders named members with values', () => {
    expect(
      typed({ kind: 'type', enumMembers: [{ name: 'Running', value: "'running'" }] }, 'enum'),
    ).toBe("enum StudioMessageSubscriber { Running = 'running' }");
  });
});

describe('generateDeclarationString — signature augmentation', () => {
  const base = (component: Partial<SubsystemComponent>): SubsystemComponent => ({
    alias: 'aug',
    name: 'fn',
    construct: 'function',
    file: 'src/fn.ts',
    purl: 'pkg:github/acme/widget',
    ...component,
  });

  test('function: renders params + return from the augmentation when no declaration', () => {
    expect(
      generateDeclarationString(
        base({
          name: 'WalkthroughsPanel',
          symbol: 'WalkthroughsPanel',
          signatureAugmentation: {
            parameters: [{ type: 'WalkthroughsPanelProps' }],
            returnType: 'JSX.Element',
          },
        }),
      ),
    ).toBe('function WalkthroughsPanel(arg0: WalkthroughsPanelProps): JSX.Element;');
  });

  test('resolveComponentDeclaration returns the augmentation when there is no own declaration', () => {
    const d = resolveComponentDeclaration(
      base({
        signatureAugmentation: {
          parameters: [{ type: 'WalkthroughsPanelProps' }],
          returnType: 'JSX.Element',
        },
      }),
    );
    expect(d?.kind).toBe('function');
    if (d?.kind === 'function') {
      expect(d.parameters).toEqual([{ type: 'WalkthroughsPanelProps' }]);
      expect(d.returnType).toBe('JSX.Element');
    }
  });

  test('resolveComponentDeclaration prefers the own declaration', () => {
    const d = resolveComponentDeclaration(
      base({
        declaration: {
          kind: 'function',
          parameters: [{ name: 'x', type: 'T' }],
          callers: [],
          callees: [],
        },
        signatureAugmentation: { parameters: [{ type: 'Other' }] },
      }),
    );
    expect(d?.kind === 'function' && d.parameters).toEqual([{ name: 'x', type: 'T' }]);
  });

  test('method: hostClass comes from the dotted symbol', () => {
    expect(
      generateDeclarationString(
        base({
          name: 'normalize',
          symbol: 'SessionReader.normalize',
          construct: 'method',
          signatureAugmentation: {
            parameters: [{ name: 'session', type: 'SessionRecord' }],
            returnType: 'SessionEvent[]',
          },
        }),
      ),
    ).toBe(
      'class SessionReader {\n  normalize(session: SessionRecord): SessionEvent[];\n}',
    );
  });

  test('own declaration wins over the augmentation', () => {
    expect(
      generateDeclarationString(
        base({
          name: 'foo',
          symbol: 'foo',
          declaration: {
            kind: 'function',
            parameters: [{ name: 'x', type: 'number' }],
            returnType: 'void',
            callers: [],
            callees: [],
          },
          signatureAugmentation: {
            parameters: [{ name: 'ignored', type: 'string' }],
            returnType: 'string',
          },
        }),
      ),
    ).toBe('function foo(x: number): void;');
  });

  test('non-callable construct ignores the augmentation', () => {
    expect(
      generateDeclarationString(
        base({
          name: 'Foo',
          symbol: 'Foo',
          construct: 'interface',
          signatureAugmentation: {
            parameters: [{ type: 'Bar' }],
            returnType: 'void',
          },
        }),
      ),
    ).toBe('interface Foo {}');
  });
});