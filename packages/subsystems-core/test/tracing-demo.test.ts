/**
 * Demo test showing how to use OTel tracing in tests.
 * This file creates spans that will be captured and written to __traces__/
 */

import { describe, test, expect } from 'bun:test';
import { traced, withSpan, tracer } from './setup';

describe('Tracing Demo', () => {
  test(
    'basic traced test',
    traced('test:basic-traced', async (span) => {
      span.setAttribute('test.type', 'demo');

      // Simulate some work
      await new Promise((r) => setTimeout(r, 10));

      expect(true).toBe(true);
    })
  );

  test(
    'nested spans',
    traced('test:nested-spans', async (span) => {
      span.setAttribute('test.type', 'nested');

      // Create child spans for different operations
      const result1 = await withSpan('operation:validate', async (childSpan) => {
        childSpan.setAttribute('operation.type', 'validation');
        await new Promise((r) => setTimeout(r, 5));
        return 'validated';
      });

      const result2 = await withSpan('operation:process', async (childSpan) => {
        childSpan.setAttribute('operation.type', 'processing');
        childSpan.setAttribute('input', result1);
        await new Promise((r) => setTimeout(r, 5));
        return 'processed';
      });

      expect(result2).toBe('processed');
    })
  );

  test('manual span creation', async () => {
    await tracer.startActiveSpan('test:manual-span', async (span) => {
      span.setAttribute('manual', true);

      // Nested manual span
      await tracer.startActiveSpan('child:computation', async (childSpan) => {
        childSpan.setAttribute('computation.type', 'example');
        await new Promise((r) => setTimeout(r, 5));
        childSpan.end();
      });

      expect(1 + 1).toBe(2);
      span.end();
    });
  });
});
