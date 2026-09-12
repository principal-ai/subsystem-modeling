import { describe, expect, test } from 'bun:test';
import { generateDeclarationString } from './formatDeclaration';
import type { SubsystemComponent } from './model';

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