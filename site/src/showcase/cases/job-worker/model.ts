import type {
  SubsystemComponent,
  SubsystemWalkthrough,
} from '@principal-ai/subsystems-react';

const PURL = 'pkg:github/you/job-worker';

export const components: SubsystemComponent[] = [
  {
    alias: 'main',
    process: 'job-worker',
    name: 'main',
    construct: 'function',
    symbol: 'main',
    role: 'entry',
    purl: PURL,
    file: 'src/main.rs',
    declarationRef: {
      file: 'src/main.rs',
      startLine: 13,
      lineHash: '4b4cfc47bd6bb499be5c57f1d849cab3',
      capturedAt: '2025-01-01T00:00:00.000Z',
    },
    purpose: 'Tokio entry — connect the queue, run the worker loop.',
    layer: 1,
  },
  {
    alias: 'run-worker',
    process: 'job-worker',
    name: 'run_worker',
    construct: 'function',
    symbol: 'run_worker',
    purl: PURL,
    file: 'src/consumer.rs',
    declarationRef: {
      file: 'src/consumer.rs',
      startLine: 8,
      lineHash: 'b95cd71f39f22b33a5a9c90e1500d583',
      capturedAt: '2025-01-01T00:00:00.000Z',
    },
    purpose: 'Dequeue loop — ack on success, nack on failure.',
    layer: 2,
  },
  {
    alias: 'handle-job',
    process: 'job-worker',
    name: 'handle_job',
    construct: 'function',
    symbol: 'handle_job',
    purl: PURL,
    file: 'src/handler.rs',
    declarationRef: {
      file: 'src/handler.rs',
      startLine: 7,
      lineHash: '617178c715270343b648ce8da055e67c',
      capturedAt: '2025-01-01T00:00:00.000Z',
    },
    purpose: 'Dispatch by job kind (email, image, …).',
    layer: 3,
  },
  {
    alias: 'redis-queue',
    process: 'job-worker',
    name: 'RedisQueue',
    construct: 'class',
    symbol: 'RedisQueue',
    purl: PURL,
    file: 'src/queue.rs',
    declarationRef: {
      file: 'src/queue.rs',
      startLine: 19,
      lineHash: '7e19b0a3477f16eed79964fdcd2aa88f',
      capturedAt: '2025-01-01T00:00:00.000Z',
    },
    purpose: 'Queue impl — BRPOP / ack / nack against Redis.',
    layer: 3,
  },
  {
    alias: 'Redis',
    name: 'Redis',
    construct: 'external',
    role: 'service',
    file: '',
    purl: 'external',
    purpose: 'Job queue backing store.',
    layer: 4,
  },
  {
    alias: 'Email',
    name: 'Email (SMTP)',
    construct: 'external',
    role: 'service',
    file: '',
    purl: 'external',
    purpose: 'Side effect for send_email jobs.',
    layer: 4,
  },
];

export const walkthroughs = [
  {
    "id": "tl-success",
    "title": "Process job (ack)",
    "steps": [
      {
        "from": "main",
        "to": "run-worker",
        "mechanism": "calls",
        "file": "src/main.rs",
        "line": 17,
        "purl": PURL,
        "symbol": "run_worker",
        "annotation": "Tokio main hands off to the consumer loop."
      },
      {
        "from": "run-worker",
        "to": "redis-queue",
        "mechanism": "calls",
        "file": "src/consumer.rs",
        "line": 10,
        "purl": PURL,
        "symbol": "dequeue",
        "annotation": "Pull the next job (or idle-sleep)."
      },
      {
        "from": "redis-queue",
        "to": "Redis",
        "mechanism": "reads",
        "file": "src/queue.rs",
        "line": 32,
        "purl": PURL,
        "symbol": "dequeue",
        "annotation": "Redis BRPOP — queue is the external."
      },
      {
        "from": "run-worker",
        "to": "handle-job",
        "mechanism": "calls",
        "file": "src/consumer.rs",
        "line": 13,
        "purl": PURL,
        "symbol": "handle_job",
        "annotation": "Dispatch into the handler."
      },
      {
        "from": "handle-job",
        "to": "Email",
        "mechanism": "calls",
        "file": "src/handler.rs",
        "line": 9,
        "purl": PURL,
        "symbol": "send_email",
        "annotation": "Kind-specific side effect (email path)."
      },
      {
        "from": "run-worker",
        "to": "redis-queue",
        "mechanism": "calls",
        "file": "src/consumer.rs",
        "line": 14,
        "purl": PURL,
        "symbol": "ack",
        "annotation": "Success — remove the job from the queue."
      }
    ]
  },
  {
    "id": "tl-fail",
    "title": "Handler fails (nack)",
    "steps": [
      {
        "from": "run-worker",
        "to": "redis-queue",
        "mechanism": "calls",
        "file": "src/consumer.rs",
        "line": 10,
        "purl": PURL,
        "symbol": "dequeue",
        "annotation": "Same dequeue path as success."
      },
      {
        "from": "run-worker",
        "to": "handle-job",
        "mechanism": "calls",
        "file": "src/consumer.rs",
        "line": 13,
        "purl": PURL,
        "symbol": "handle_job",
        "annotation": "Handler returns Err."
      },
      {
        "from": "run-worker",
        "to": "redis-queue",
        "mechanism": "calls",
        "file": "src/consumer.rs",
        "line": 17,
        "purl": PURL,
        "symbol": "nack",
        "annotation": "Failure — requeue for retry (LPUSH)."
      },
      {
        "from": "redis-queue",
        "to": "Redis",
        "mechanism": "writes",
        "file": "src/queue.rs",
        "line": 41,
        "purl": PURL,
        "symbol": "nack",
        "annotation": "Redis write puts the job back."
      }
    ]
  }
] as SubsystemWalkthrough[];

export const title = 'Tokio job worker';

export const description =
  'Rust **Tokio** background worker: connect a Redis queue, dequeue forever, dispatch handlers, **ack** on success and **nack** on failure. Open **Walkthroughs** for the happy path and the retry path.';
