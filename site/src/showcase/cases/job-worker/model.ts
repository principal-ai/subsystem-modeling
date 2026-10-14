import type {
  SubsystemComponent,
  SubsystemTrail,
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
    declarationSpan: {
      startLine: 13,
      endLine: 13,
      contentHash: '4b4cfc47bd6bb499be5c57f1d849cab3',
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
    declarationSpan: {
      startLine: 8,
      endLine: 8,
      contentHash: 'b95cd71f39f22b33a5a9c90e1500d583',
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
    declarationSpan: {
      startLine: 7,
      endLine: 7,
      contentHash: '617178c715270343b648ce8da055e67c',
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
    declarationSpan: {
      startLine: 19,
      endLine: 19,
      contentHash: '7e19b0a3477f16eed79964fdcd2aa88f',
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

export const trails = [
  {
    "id": "tl-success",
    "title": "Process job (ack)",
    "steps": [
      {
        "from": "main",
        "to": "run-worker",
        "mechanism": "calls",
        "file": "src/main.rs",
        "span": {
          "startLine": 17,
          "endLine": 17,
          "contentHash": "3351d340c6940af1036244c54ddf8126"
        },
        "purl": PURL,
        "symbol": "run_worker",
        "annotation": "Tokio main hands off to the consumer loop."
      },
      {
        "from": "run-worker",
        "to": "redis-queue",
        "mechanism": "calls",
        "file": "src/consumer.rs",
        "span": {
          "startLine": 10,
          "endLine": 10,
          "contentHash": "2af1459fed3c9398d1ad824ca476c18e"
        },
        "purl": PURL,
        "symbol": "dequeue",
        "annotation": "Pull the next job (or idle-sleep)."
      },
      {
        "from": "redis-queue",
        "to": "Redis",
        "mechanism": "reads",
        "file": "src/queue.rs",
        "span": {
          "startLine": 32,
          "endLine": 32,
          "contentHash": "21939d75647bc0c615f026a3e1f46db9"
        },
        "purl": PURL,
        "symbol": "dequeue",
        "annotation": "Redis BRPOP — queue is the external."
      },
      {
        "from": "run-worker",
        "to": "handle-job",
        "mechanism": "calls",
        "file": "src/consumer.rs",
        "span": {
          "startLine": 13,
          "endLine": 13,
          "contentHash": "e04ad4ea63511e76f40a2533a4b7e3a3"
        },
        "purl": PURL,
        "symbol": "handle_job",
        "annotation": "Dispatch into the handler."
      },
      {
        "from": "handle-job",
        "to": "Email",
        "mechanism": "calls",
        "file": "src/handler.rs",
        "span": {
          "startLine": 9,
          "endLine": 9,
          "contentHash": "d30f9f7555b44be58a858bfd5991a6d0"
        },
        "purl": PURL,
        "symbol": "send_email",
        "annotation": "Kind-specific side effect (email path)."
      },
      {
        "from": "run-worker",
        "to": "redis-queue",
        "mechanism": "calls",
        "file": "src/consumer.rs",
        "span": {
          "startLine": 14,
          "endLine": 14,
          "contentHash": "6c408f5c0c1939322583edb786c9333f"
        },
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
        "span": {
          "startLine": 10,
          "endLine": 10,
          "contentHash": "2af1459fed3c9398d1ad824ca476c18e"
        },
        "purl": PURL,
        "symbol": "dequeue",
        "annotation": "Same dequeue path as success."
      },
      {
        "from": "run-worker",
        "to": "handle-job",
        "mechanism": "calls",
        "file": "src/consumer.rs",
        "span": {
          "startLine": 13,
          "endLine": 13,
          "contentHash": "e04ad4ea63511e76f40a2533a4b7e3a3"
        },
        "purl": PURL,
        "symbol": "handle_job",
        "annotation": "Handler returns Err."
      },
      {
        "from": "run-worker",
        "to": "redis-queue",
        "mechanism": "calls",
        "file": "src/consumer.rs",
        "span": {
          "startLine": 17,
          "endLine": 17,
          "contentHash": "763ccc5f0993d0d3e70fabdda854dd5f"
        },
        "purl": PURL,
        "symbol": "nack",
        "annotation": "Failure — requeue for retry (LPUSH)."
      },
      {
        "from": "redis-queue",
        "to": "Redis",
        "mechanism": "writes",
        "file": "src/queue.rs",
        "span": {
          "startLine": 41,
          "endLine": 41,
          "contentHash": "67f413993bcb273037564c13a2ba4f6c"
        },
        "purl": PURL,
        "symbol": "nack",
        "annotation": "Redis write puts the job back."
      }
    ]
  }
] as SubsystemTrail[];

export const title = 'Tokio job worker';

export const description =
  'Rust **Tokio** background worker: connect a Redis queue, dequeue forever, dispatch handlers, **ack** on success and **nack** on failure. Open **Trails** for the happy path and the retry path.';
