/**
 * Tests for scopes validate command
 */
import { describe, test, expect } from 'bun:test';
import { getScopeNames } from '@principal-ai/subsystems-core/node';
import type { ComponentLibrary, OwnedScopes } from '@principal-ai/subsystems-core';

/**
 * Helper to extract owned scopes from a library - mirrors the logic in validate.ts
 * This is the fixed version that does NOT include service.name
 */
function collectOwnedScopes(library: ComponentLibrary): string[] {
  const ownedScopes: string[] = [];

  // Collect scopes from top-level scopes section
  if (library?.scopes) {
    ownedScopes.push(...Object.keys(library.scopes));
  }

  // Collect from resources owned-scopes (references)
  if (library?.resources) {
    for (const [_resourceKey, attrs] of Object.entries(library.resources)) {
      const scopes = (attrs as Record<string, unknown>)['owned-scopes'] as OwnedScopes | undefined;
      const scopeNames = getScopeNames(scopes);
      ownedScopes.push(...scopeNames);
    }
  }

  // Remove duplicates
  return [...new Set(ownedScopes)];
}

describe('scopes validate - owned scope collection', () => {
  test('should collect scopes from owned-scopes arrays only', () => {
    const library: ComponentLibrary = {
      resources: {
        server: {
          'service.name': 'control-tower-server',
          'owned-scopes': ['websocket-adapter', 'auth-adapter', 'server', 'message-handler'],
        },
        client: {
          'service.name': 'control-tower-client',
          'owned-scopes': ['client-lifecycle', 'client-response'],
        },
      },
    };

    const ownedScopes = collectOwnedScopes(library);

    // Should include all owned-scopes
    expect(ownedScopes).toContain('websocket-adapter');
    expect(ownedScopes).toContain('auth-adapter');
    expect(ownedScopes).toContain('server');
    expect(ownedScopes).toContain('message-handler');
    expect(ownedScopes).toContain('client-lifecycle');
    expect(ownedScopes).toContain('client-response');

    // Should NOT include service.name values (this is the bug fix)
    expect(ownedScopes).not.toContain('control-tower-server');
    expect(ownedScopes).not.toContain('control-tower-client');

    // Should have exactly 6 scopes
    expect(ownedScopes).toHaveLength(6);
  });

  test('should collect scopes from top-level scopes section', () => {
    const library: ComponentLibrary = {
      scopes: {
        'websocket-adapter': { color: '#3B82F6' },
        'auth-adapter': { color: '#10B981' },
      },
    };

    const ownedScopes = collectOwnedScopes(library);

    expect(ownedScopes).toContain('websocket-adapter');
    expect(ownedScopes).toContain('auth-adapter');
    expect(ownedScopes).toHaveLength(2);
  });

  test('should combine scopes from both top-level and resources', () => {
    const library: ComponentLibrary = {
      scopes: {
        'shared-scope': { color: '#3B82F6' },
      },
      resources: {
        server: {
          'service.name': 'my-server',
          'owned-scopes': ['server-scope'],
        },
      },
    };

    const ownedScopes = collectOwnedScopes(library);

    expect(ownedScopes).toContain('shared-scope');
    expect(ownedScopes).toContain('server-scope');
    expect(ownedScopes).not.toContain('my-server');
    expect(ownedScopes).toHaveLength(2);
  });

  test('should deduplicate scopes that appear in multiple places', () => {
    const library: ComponentLibrary = {
      scopes: {
        'shared-scope': { color: '#3B82F6' },
      },
      resources: {
        server: {
          'service.name': 'my-server',
          'owned-scopes': ['shared-scope', 'server-scope'],
        },
        client: {
          'service.name': 'my-client',
          'owned-scopes': ['shared-scope', 'client-scope'],
        },
      },
    };

    const ownedScopes = collectOwnedScopes(library);

    expect(ownedScopes).toContain('shared-scope');
    expect(ownedScopes).toContain('server-scope');
    expect(ownedScopes).toContain('client-scope');
    // shared-scope should only appear once despite being in 3 places
    expect(ownedScopes).toHaveLength(3);
  });

  test('should handle resources without owned-scopes', () => {
    const library: ComponentLibrary = {
      resources: {
        server: {
          'service.name': 'my-server',
          // no owned-scopes
        },
      },
    };

    const ownedScopes = collectOwnedScopes(library);

    expect(ownedScopes).not.toContain('my-server');
    expect(ownedScopes).toHaveLength(0);
  });

  test('should handle empty library', () => {
    const library: ComponentLibrary = {};

    const ownedScopes = collectOwnedScopes(library);

    expect(ownedScopes).toHaveLength(0);
  });

  test('should handle library with only service.name and no owned-scopes', () => {
    const library: ComponentLibrary = {
      resources: {
        server: {
          'service.name': 'control-tower-server',
        },
        client: {
          'service.name': 'control-tower-client',
        },
      },
    };

    const ownedScopes = collectOwnedScopes(library);

    // service.name values should NOT be treated as scopes
    expect(ownedScopes).not.toContain('control-tower-server');
    expect(ownedScopes).not.toContain('control-tower-client');
    expect(ownedScopes).toHaveLength(0);
  });
});

describe('scopes validate - OTEL semantic model', () => {
  test('service.name is a resource identifier, not a scope', () => {
    // This test documents the OTEL semantic model:
    // - Resources are identified by service.name (e.g., "control-tower-server")
    // - Scopes are instrumentation boundaries within resources (e.g., "websocket-adapter")
    // The validator should only validate that owned-scopes are documented,
    // NOT that service.name values are documented as scopes.

    const library: ComponentLibrary = {
      resources: {
        server: {
          'service.name': 'control-tower-server', // This is a RESOURCE identifier
          'owned-scopes': ['websocket-adapter'], // These are SCOPES within the resource
        },
      },
    };

    const ownedScopes = collectOwnedScopes(library);

    // The validator should only require "websocket-adapter" to be documented
    // It should NOT require "control-tower-server" to be documented as a scope
    expect(ownedScopes).toEqual(['websocket-adapter']);
  });
});
