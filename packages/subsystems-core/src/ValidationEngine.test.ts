import { ValidationEngine } from './ValidationEngine';
import type { GraphEvent, GraphState, ValidationRules } from './types';
import { traced, withSpan } from '../test/setup';

describe('ValidationEngine', () => {
  let testState: GraphState;

  beforeEach(() => {
    testState = {
      nodes: new Map([
        [
          'user-1',
          {
            id: 'user-1',
            type: 'user',
            data: { userId: 'alice' },
            state: 'offline',
            createdAt: Date.now(),
            updatedAt: Date.now(),
          },
        ],
        [
          'server-1',
          {
            id: 'server-1',
            type: 'server',
            data: { uptime: 0 },
            createdAt: Date.now(),
            updatedAt: Date.now(),
          },
        ],
      ]),
      edges: new Map(),
      configuration: {
        metadata: { name: 'Test', version: '1.0.0' },
        nodeTypes: {
          user: { shape: 'circle', dataSchema: {} },
          server: { shape: 'hexagon', dataSchema: {} },
        },
        edgeTypes: {
          connection: { style: 'solid', directed: true },
        },
        allowedConnections: [{ from: 'user', to: 'server', via: 'connection' }],
      },
    };
  });

  describe('Connection Validation', () => {
    it(
      'should allow valid connections',
      traced('validation:connection:valid', async (span) => {
        span.setAttribute('test.category', 'connection');
        span.setAttribute('test.expectation', 'allow');

        const result = await withSpan(
          'engine:create',
          async (engineSpan) => {
            const rules: ValidationRules = {};
            const engine = new ValidationEngine(rules);
            engineSpan.setAttribute('rules.count', 0);
            return engine;
          },
          span
        );

        const engine = result;

        const event: GraphEvent = {
          id: 'evt-1',
          type: 'edge_created',
          timestamp: Date.now(),
          category: 'edge',
          operation: 'create',
          payload: {
            operation: 'create',
            edgeId: 'conn-1',
            edgeType: 'connection',
            from: 'user-1',
            to: 'server-1',
          },
          expected: true,
        };

        const validationResult = await withSpan(
          'engine:validate',
          async (validateSpan) => {
            validateSpan.setAttribute('event.type', event.type);
            validateSpan.setAttribute('edge.from', 'user-1');
            validateSpan.setAttribute('edge.to', 'server-1');
            return engine.validate(event, testState);
          },
          span
        );

        expect(validationResult.valid).toBe(true);
        expect(validationResult.violations).toHaveLength(0);
        span.setAttribute('result.valid', true);
      })
    );

    it(
      'should reject invalid connections',
      traced('validation:connection:invalid', async (span) => {
        span.setAttribute('test.category', 'connection');
        span.setAttribute('test.expectation', 'reject');

        const rules: ValidationRules = {};
        const engine = new ValidationEngine(rules);

        // Try to connect server to user (not allowed)
        const event: GraphEvent = {
          id: 'evt-1',
          type: 'edge_created',
          timestamp: Date.now(),
          category: 'edge',
          operation: 'create',
          payload: {
            operation: 'create',
            edgeId: 'conn-1',
            edgeType: 'connection',
            from: 'server-1',
            to: 'user-1',
          },
          expected: true,
        };

        const result = await withSpan(
          'engine:validate',
          async (validateSpan) => {
            validateSpan.setAttribute('event.type', event.type);
            validateSpan.setAttribute('edge.from', 'server-1');
            validateSpan.setAttribute('edge.to', 'user-1');
            return engine.validate(event, testState);
          },
          span
        );

        expect(result.valid).toBe(false);
        expect(result.violations).toHaveLength(1);
        expect(result.violations[0].type).toBe('connection');
        expect(result.violations[0].severity).toBe('error');
        span.setAttribute('result.valid', false);
        span.setAttribute('result.violations', 1);
      })
    );

    it(
      'should reject connections when nodes do not exist',
      traced('validation:connection:missing-node', async (span) => {
        span.setAttribute('test.category', 'connection');
        span.setAttribute('test.expectation', 'reject');

        const rules: ValidationRules = {};
        const engine = new ValidationEngine(rules);

        const event: GraphEvent = {
          id: 'evt-1',
          type: 'edge_created',
          timestamp: Date.now(),
          category: 'edge',
          operation: 'create',
          payload: {
            operation: 'create',
            edgeId: 'conn-1',
            edgeType: 'connection',
            from: 'user-1',
            to: 'nonexistent-node',
          },
          expected: true,
        };

        const result = await withSpan(
          'engine:validate',
          async (validateSpan) => {
            validateSpan.setAttribute('edge.to', 'nonexistent-node');
            return engine.validate(event, testState);
          },
          span
        );

        expect(result.valid).toBe(false);
        expect(result.violations).toHaveLength(1);
        expect(result.violations[0].description).toContain('do not exist');
        span.setAttribute('result.valid', false);
      })
    );
  });

  describe('State Transition Validation', () => {
    it(
      'should allow valid state transitions',
      traced('validation:state:valid-transition', async (span) => {
        span.setAttribute('test.category', 'state-transition');
        span.setAttribute('test.expectation', 'allow');

        const rules: ValidationRules = {
          stateTransitions: {
            user: [
              { from: 'offline', to: ['online'] },
              { from: 'online', to: ['offline', 'grace'] },
            ],
          },
        };

        const engine = await withSpan(
          'engine:create-with-rules',
          async (engineSpan) => {
            engineSpan.setAttribute('rules.stateTransitions', true);
            return new ValidationEngine(rules);
          },
          span
        );

        const event: GraphEvent = {
          id: 'evt-1',
          type: 'state_changed',
          timestamp: Date.now(),
          category: 'state',
          operation: 'update',
          payload: {
            nodeId: 'user-1',
            previousState: 'offline',
            newState: 'online',
          },
          expected: true,
        };

        const result = await withSpan(
          'engine:validate-transition',
          async (validateSpan) => {
            validateSpan.setAttribute('state.from', 'offline');
            validateSpan.setAttribute('state.to', 'online');
            return engine.validate(event, testState);
          },
          span
        );

        expect(result.valid).toBe(true);
        expect(result.violations).toHaveLength(0);
        span.setAttribute('result.valid', true);
      })
    );

    it(
      'should reject invalid state transitions',
      traced('validation:state:invalid-transition', async (span) => {
        span.setAttribute('test.category', 'state-transition');
        span.setAttribute('test.expectation', 'reject');

        const rules: ValidationRules = {
          stateTransitions: {
            user: [
              { from: 'offline', to: ['online'] },
              { from: 'online', to: ['offline', 'grace'] },
            ],
          },
        };
        const engine = new ValidationEngine(rules);

        // Try to go from offline to grace (not allowed)
        const event: GraphEvent = {
          id: 'evt-1',
          type: 'state_changed',
          timestamp: Date.now(),
          category: 'state',
          operation: 'update',
          payload: {
            nodeId: 'user-1',
            previousState: 'offline',
            newState: 'grace',
          },
          expected: true,
        };

        const result = await withSpan(
          'engine:validate-transition',
          async (validateSpan) => {
            validateSpan.setAttribute('state.from', 'offline');
            validateSpan.setAttribute('state.to', 'grace');
            validateSpan.setAttribute('state.allowed', false);
            return engine.validate(event, testState);
          },
          span
        );

        expect(result.valid).toBe(false);
        expect(result.violations).toHaveLength(1);
        expect(result.violations[0].type).toBe('state');
        expect(result.violations[0].description).toContain('Invalid state transition');
        span.setAttribute('result.valid', false);
        span.setAttribute('result.violations', 1);
      })
    );
  });

  describe('Cardinality Constraints', () => {
    it(
      'should check minimum cardinality',
      traced('validation:cardinality:min-violation', async (span) => {
        span.setAttribute('test.category', 'cardinality');
        span.setAttribute('test.constraint', 'minimum');

        const rules: ValidationRules = {
          cardinality: {
            server: { min: 1, max: 1 },
          },
        };

        const engine = await withSpan(
          'engine:create-with-cardinality',
          async (engineSpan) => {
            engineSpan.setAttribute('cardinality.server.min', 1);
            engineSpan.setAttribute('cardinality.server.max', 1);
            return new ValidationEngine(rules);
          },
          span
        );

        // Remove server node
        const stateWithoutServer: GraphState = {
          ...testState,
          nodes: new Map(Array.from(testState.nodes.entries()).filter(([id]) => id !== 'server-1')),
        };

        const violations = await withSpan(
          'engine:check-constraints',
          async (checkSpan) => {
            checkSpan.setAttribute('state.serverCount', 0);
            return engine.checkConstraints(stateWithoutServer);
          },
          span
        );

        expect(violations).toHaveLength(1);
        expect(violations[0].type).toBe('cardinality');
        expect(violations[0].description).toContain('at least 1');
        span.setAttribute('result.violations', 1);
      })
    );

    it(
      'should check maximum cardinality',
      traced('validation:cardinality:max-violation', async (span) => {
        span.setAttribute('test.category', 'cardinality');
        span.setAttribute('test.constraint', 'maximum');

        const rules: ValidationRules = {
          cardinality: {
            server: { min: 1, max: 1 },
          },
        };
        const engine = new ValidationEngine(rules);

        // Add second server node
        testState.nodes.set('server-2', {
          id: 'server-2',
          type: 'server',
          data: { uptime: 0 },
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });

        const violations = await withSpan(
          'engine:check-constraints',
          async (checkSpan) => {
            checkSpan.setAttribute('state.serverCount', 2);
            return engine.checkConstraints(testState);
          },
          span
        );

        expect(violations).toHaveLength(1);
        expect(violations[0].type).toBe('cardinality');
        expect(violations[0].description).toContain('at most 1');
        span.setAttribute('result.violations', 1);
      })
    );

    it(
      'should pass when cardinality is within bounds',
      traced('validation:cardinality:within-bounds', async (span) => {
        span.setAttribute('test.category', 'cardinality');
        span.setAttribute('test.expectation', 'pass');

        const rules: ValidationRules = {
          cardinality: {
            server: { min: 1, max: 2 },
          },
        };
        const engine = new ValidationEngine(rules);

        const violations = await withSpan(
          'engine:check-constraints',
          async (checkSpan) => {
            checkSpan.setAttribute('state.serverCount', 1);
            checkSpan.setAttribute('cardinality.min', 1);
            checkSpan.setAttribute('cardinality.max', 2);
            return engine.checkConstraints(testState);
          },
          span
        );

        expect(violations).toHaveLength(0);
        span.setAttribute('result.violations', 0);
      })
    );
  });

  describe('Unexpected Events', () => {
    it('should flag unexpected events', () => {
      const rules: ValidationRules = {};
      const engine = new ValidationEngine(rules);

      const event: GraphEvent = {
        id: 'evt-1',
        type: 'unexpected_event',
        timestamp: Date.now(),
        category: 'node',
        operation: 'create',
        payload: {
          operation: 'create',
          nodeId: 'user-2',
          nodeType: 'user',
          data: {},
        },
        expected: false, // Marked as unexpected
      };

      const result = engine.validate(event, testState);

      expect(result.valid).toBe(true); // Still valid, just a warning
      expect(result.violations).toHaveLength(1);
      expect(result.violations[0].type).toBe('unexpected_event');
      expect(result.violations[0].severity).toBe('warning');
    });

    it('should not flag expected events', () => {
      const rules: ValidationRules = {};
      const engine = new ValidationEngine(rules);

      const event: GraphEvent = {
        id: 'evt-1',
        type: 'expected_event',
        timestamp: Date.now(),
        category: 'node',
        operation: 'create',
        payload: {
          operation: 'create',
          nodeId: 'user-2',
          nodeType: 'user',
          data: {},
        },
        expected: true,
      };

      const result = engine.validate(event, testState);

      const unexpectedViolations = result.violations.filter((v) => v.type === 'unexpected_event');
      expect(unexpectedViolations).toHaveLength(0);
    });
  });

  describe('Validation Metrics', () => {
    it('should track validation metrics', () => {
      const rules: ValidationRules = {};
      const engine = new ValidationEngine(rules);

      const event: GraphEvent = {
        id: 'evt-1',
        type: 'edge_created',
        timestamp: Date.now(),
        category: 'edge',
        operation: 'create',
        payload: {
          operation: 'create',
          edgeId: 'conn-1',
          edgeType: 'connection',
          from: 'user-1',
          to: 'server-1',
        },
        expected: true,
      };

      const result = engine.validate(event, testState);

      expect(result.metrics.totalEvents).toBe(1);
      expect(result.metrics.validEvents).toBe(1);
      expect(result.metrics.violations).toBe(0);
      expect(result.metrics.unexpectedEvents).toBe(0);
    });

    it('should count violations in metrics', () => {
      const rules: ValidationRules = {};
      const engine = new ValidationEngine(rules);

      // Invalid connection
      const event: GraphEvent = {
        id: 'evt-1',
        type: 'edge_created',
        timestamp: Date.now(),
        category: 'edge',
        operation: 'create',
        payload: {
          operation: 'create',
          edgeId: 'conn-1',
          edgeType: 'connection',
          from: 'server-1',
          to: 'user-1',
        },
        expected: true,
      };

      const result = engine.validate(event, testState);

      expect(result.metrics.totalEvents).toBe(1);
      expect(result.metrics.validEvents).toBe(0);
      expect(result.metrics.violations).toBe(1);
    });
  });
});
