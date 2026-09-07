# @principal-ai/visual-validation-core

Core logic library for the Visual Validation Framework - **framework-agnostic**.

## Features

- 📋 TypeScript type definitions for graph configurations and events
- ⚙️ Event processing engine
- ✅ Validation engine with rule checking
- 📊 Graph state management
- 🧪 Test instrumentation helpers

**Zero UI dependencies** - can be used in Node.js, tests, or any JavaScript environment.

## Installation

```bash
npm install @principal-ai/visual-validation-core
# or
bun add @principal-ai/visual-validation-core
```

## Usage

### Define Configuration

```typescript
import type { GraphConfiguration } from '@principal-ai/visual-validation-core';

const config: GraphConfiguration = {
  metadata: {
    name: 'Control Tower',
    version: '1.0.0',
  },
  nodeTypes: {
    user: {
      shape: 'circle',
      color: '#4CAF50',
      dataSchema: {
        userId: { type: 'string', required: true },
      },
      states: {
        online: { color: '#4CAF50' },
        offline: { color: '#9E9E9E' },
      },
    },
    server: {
      shape: 'hexagon',
      color: '#9C27B0',
      dataSchema: {
        uptime: { type: 'number' },
      },
    },
  },
  edgeTypes: {
    connection: {
      style: 'solid',
      directed: true,
    },
  },
  allowedConnections: [{ from: 'user', to: 'server', via: 'connection' }],
  validation: {
    stateTransitions: {
      user: [
        { from: 'offline', to: ['online'] },
        { from: 'online', to: ['offline'] },
      ],
    },
  },
};
```

### Process Events

```typescript
import { EventProcessor } from '@principal-ai/visual-validation-core';

const processor = new EventProcessor(config);

// Process events
const result = processor.processEvent({
  id: 'evt-1',
  type: 'user_connected',
  timestamp: Date.now(),
  category: 'node',
  operation: 'create',
  payload: {
    operation: 'create',
    nodeId: 'user-1',
    nodeType: 'user',
    data: { userId: 'alice' },
  },
  expected: true,
});

console.log('Valid:', result.validation.valid);
console.log('Violations:', result.validation.violations);
```

### Test Instrumentation

```typescript
import { GraphInstrumentationHelper } from '@principal-ai/visual-validation-core';

describe('My system test', () => {
  it('should handle user connections', () => {
    const helper = new GraphInstrumentationHelper(config);

    // Emit events from your test
    helper.emitNodeCreated('server-1', 'server', { uptime: 0 });
    helper.emitNodeCreated('user-alice', 'user', { userId: 'alice' });
    helper.emitEdgeCreated('conn-1', 'connection', 'user-alice', 'server-1');
    helper.emitStateChange('user-alice', 'online');
  });
});
```

## API

See the main [README](../../README.md) for full documentation.

## License

MIT
