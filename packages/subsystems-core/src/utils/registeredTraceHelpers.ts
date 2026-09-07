/**
 * Helper utilities for working with RegisteredTrace
 *
 * These helpers provide convenient access to scope and match information
 * from the multi-resource, multi-scope RegisteredTrace structure.
 */

import type {
  RegisteredTrace,
  ScenarioMatch,
  StoryboardMatch,
  UnmatchedSpan,
} from '../types/registered-trace';

/**
 * Scope information extracted from trace or match
 */
export interface ScopeInfo {
  name: string;
  version: string;
}

/**
 * Get scope info from a ScenarioMatch
 */
export function getScopeFromScenarioMatch(match: ScenarioMatch): ScopeInfo {
  return {
    name: match.scopeName,
    version: match.scopeVersion || 'unknown',
  };
}

/**
 * Get scope info from a StoryboardMatch
 */
export function getScopeFromStoryboardMatch(match: StoryboardMatch): ScopeInfo {
  return {
    name: match.scopeName,
    version: match.scopeVersion || 'unknown',
  };
}

/**
 * Get scope info from an UnmatchedSpan
 */
export function getScopeFromUnmatchedSpan(span: UnmatchedSpan): ScopeInfo {
  return {
    name: span.scopeName,
    version: span.scopeVersion || 'unknown',
  };
}

/**
 * Get primary scope from trace resources
 * Returns the first scope from the first resource
 */
export function getPrimaryScope(trace: RegisteredTrace): ScopeInfo | null {
  const firstScope = trace.resources?.[0]?.scopes?.[0];
  if (!firstScope) return null;
  return {
    name: firstScope.scope.name,
    version: firstScope.scope.version || 'unknown',
  };
}

/**
 * Get all unique scopes from trace resources
 * Deduplicates by scope name
 */
export function getAllScopes(trace: RegisteredTrace): ScopeInfo[] {
  const scopeMap = new Map<string, ScopeInfo>();

  for (const resource of trace.resources || []) {
    for (const scopeInfo of resource.scopes || []) {
      // Use name as key for deduplication
      if (!scopeMap.has(scopeInfo.scope.name)) {
        scopeMap.set(scopeInfo.scope.name, {
          name: scopeInfo.scope.name,
          version: scopeInfo.scope.version || 'unknown',
        });
      }
    }
  }

  return Array.from(scopeMap.values());
}

/**
 * Get all unique scopes that have scenario matches
 * These are scopes where spans fully matched workflows and scenarios
 */
export function getMatchedScopes(trace: RegisteredTrace): ScopeInfo[] {
  const scopeMap = new Map<string, ScopeInfo>();

  for (const match of trace.scenarioMatches || []) {
    if (!scopeMap.has(match.scopeName)) {
      scopeMap.set(match.scopeName, {
        name: match.scopeName,
        version: match.scopeVersion || 'unknown',
      });
    }
  }

  return Array.from(scopeMap.values());
}

/**
 * Get all unique scopes that have storyboard matches (partial matches)
 * These are scopes where spans matched workflows but not scenarios
 */
export function getPartialMatchedScopes(trace: RegisteredTrace): ScopeInfo[] {
  const scopeMap = new Map<string, ScopeInfo>();

  for (const match of trace.storyboardMatches || []) {
    if (!scopeMap.has(match.scopeName)) {
      scopeMap.set(match.scopeName, {
        name: match.scopeName,
        version: match.scopeVersion || 'unknown',
      });
    }
  }

  return Array.from(scopeMap.values());
}

/**
 * Get all unique scopes from unmatched spans
 */
export function getUnmatchedScopes(trace: RegisteredTrace): ScopeInfo[] {
  const scopeMap = new Map<string, ScopeInfo>();

  for (const span of trace.unmatchedSpans?.spans || []) {
    if (!scopeMap.has(span.scopeName)) {
      scopeMap.set(span.scopeName, {
        name: span.scopeName,
        version: span.scopeVersion || 'unknown',
      });
    }
  }

  return Array.from(scopeMap.values());
}

/**
 * Find scope info by name from trace resources
 */
export function findScopeByName(
  trace: RegisteredTrace,
  scopeName: string
): ScopeInfo | null {
  for (const resource of trace.resources || []) {
    for (const scopeInfo of resource.scopes || []) {
      if (scopeInfo.scope.name === scopeName) {
        return {
          name: scopeInfo.scope.name,
          version: scopeInfo.scope.version || 'unknown',
        };
      }
    }
  }
  return null;
}

/**
 * Get span count for a specific scope
 */
export function getSpanCountForScope(
  trace: RegisteredTrace,
  scopeName: string
): number {
  let count = 0;

  for (const resource of trace.resources || []) {
    for (const scopeInfo of resource.scopes || []) {
      if (scopeInfo.scope.name === scopeName) {
        count += scopeInfo.spanIds.length;
      }
    }
  }

  return count;
}

/**
 * Get the scope with the most spans (likely the "primary" scope)
 */
export function getScopeWithMostSpans(trace: RegisteredTrace): ScopeInfo | null {
  let maxSpans = 0;
  let primaryScope: ScopeInfo | null = null;

  for (const resource of trace.resources || []) {
    for (const scopeInfo of resource.scopes || []) {
      const spanCount = scopeInfo.spanIds.length;
      if (spanCount > maxSpans) {
        maxSpans = spanCount;
        primaryScope = {
          name: scopeInfo.scope.name,
          version: scopeInfo.scope.version || 'unknown',
        };
      }
    }
  }

  return primaryScope;
}

/**
 * Check if a scope has any matches (scenario or storyboard)
 */
export function scopeHasMatches(
  trace: RegisteredTrace,
  scopeName: string
): boolean {
  const hasScenarioMatch = trace.scenarioMatches?.some(
    (m) => m.scopeName === scopeName
  );
  const hasStoryboardMatch = trace.storyboardMatches?.some(
    (m) => m.scopeName === scopeName
  );

  return hasScenarioMatch || hasStoryboardMatch || false;
}

/**
 * Get match summary for a scope
 */
export function getScopeMatchSummary(
  trace: RegisteredTrace,
  scopeName: string
): {
  scenarioMatches: number;
  storyboardMatches: number;
  unmatchedSpans: number;
  totalSpans: number;
} {
  const scenarioMatches =
    trace.scenarioMatches?.filter((m) => m.scopeName === scopeName).length || 0;
  const storyboardMatches =
    trace.storyboardMatches?.filter((m) => m.scopeName === scopeName).length || 0;
  const unmatchedSpans =
    trace.unmatchedSpans?.spans.filter((s) => s.scopeName === scopeName).length ||
    0;
  const totalSpans = getSpanCountForScope(trace, scopeName);

  return {
    scenarioMatches,
    storyboardMatches,
    unmatchedSpans,
    totalSpans,
  };
}
