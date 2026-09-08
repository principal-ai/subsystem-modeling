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
      detail: {
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