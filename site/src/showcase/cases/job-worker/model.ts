import type {
  SubsystemComponent,
  SubsystemComponentEdge,
} from '@principal-ai/subsystems-react';
import type { SubsystemThroughline } from '@principal-ai/subsystems-react/dist/subsystem/model.js';

const PURL = 'pkg:github/you/job-worker';

export const components: SubsystemComponent[] = [
  {
    id: 'main',
    process: 'job-worker',
    name: 'main',
    construct: 'function',
    symbol: 'main',
    role: 'entry',
    purl: PURL,
    file: 'src/main.rs',
    purpose: 'Tokio entry — connect the queue, run the worker loop.',
    layer: 1,
  },
  {
    id: 'run-worker',
    process: 'job-worker',
    name: 'run_worker',
    construct: 'function',
    symbol: 'run_worker',
    purl: PURL,
    file: 'src/consumer.rs',
    purpose: 'Dequeue loop — ack on success, nack on failure.',
    layer: 2,
  },
  {
    id: 'handle-job',
    process: 'job-worker',
    name: 'handle_job',
    construct: 'function',
    symbol: 'handle_job',
    purl: PURL,
    file: 'src/handler.rs',
    purpose: 'Dispatch by job kind (email, image, …).',
    layer: 3,
  },
  {
    id: 'redis-queue',
    process: 'job-worker',
    name: 'RedisQueue',
    construct: 'class',
    symbol: 'RedisQueue',
    purl: PURL,
    file: 'src/queue.rs',
    purpose: 'Queue impl — BRPOP / ack / nack against Redis.',
    layer: 3,
  },
  {
    id: 'Redis',
    name: 'Redis',
    construct: 'external',
    role: 'service',
    file: '',
    purl: 'external',
    purpose: 'Job queue backing store.',
    layer: 4,
  },
  {
    id: 'Email',
    name: 'Email (SMTP)',
    construct: 'external',
    role: 'service',
    file: '',
    purl: 'external',
    purpose: 'Side effect for send_email jobs.',
    layer: 4,
  },
];

export const edges: SubsystemComponentEdge[] = [
  { id: 'e0', from: 'main', to: 'redis-queue', mechanism: 'calls' },
  { id: 'e1', from: 'main', to: 'run-worker', mechanism: 'calls' },
  { id: 'e2', from: 'run-worker', to: 'redis-queue', mechanism: 'calls' },
  { id: 'e3', from: 'run-worker', to: 'handle-job', mechanism: 'calls' },
  { id: 'e4', from: 'redis-queue', to: 'Redis', mechanism: 'reads' },
  { id: 'e5', from: 'redis-queue', to: 'Redis', mechanism: 'writes' },
  { id: 'e6', from: 'handle-job', to: 'Email', mechanism: 'calls' },
];

export const throughlines: SubsystemThroughline[] = [
  {
    id: 'tl-success',
    title: 'Process job (ack)',
    steps: [
      {
        edgeId: 'e1',
        file: 'src/main.rs',
        line: 17,
        symbol: 'run_worker',
        annotation: 'Tokio main hands off to the consumer loop.',
      },
      {
        edgeId: 'e2',
        file: 'src/consumer.rs',
        line: 10,
        symbol: 'dequeue',
        annotation: 'Pull the next job (or idle-sleep).',
      },
      {
        edgeId: 'e4',
        file: 'src/queue.rs',
        line: 32,
        symbol: 'dequeue',
        annotation: 'Redis BRPOP — queue is the external.',
      },
      {
        edgeId: 'e3',
        file: 'src/consumer.rs',
        line: 13,
        symbol: 'handle_job',
        annotation: 'Dispatch into the handler.',
      },
      {
        edgeId: 'e6',
        file: 'src/handler.rs',
        line: 9,
        symbol: 'send_email',
        annotation: 'Kind-specific side effect (email path).',
      },
      {
        edgeId: 'e2',
        file: 'src/consumer.rs',
        line: 14,
        symbol: 'ack',
        annotation: 'Success — remove the job from the queue.',
      },
    ],
  },
  {
    id: 'tl-fail',
    title: 'Handler fails (nack)',
    steps: [
      {
        edgeId: 'e2',
        file: 'src/consumer.rs',
        line: 10,
        symbol: 'dequeue',
        annotation: 'Same dequeue path as success.',
      },
      {
        edgeId: 'e3',
        file: 'src/consumer.rs',
        line: 13,
        symbol: 'handle_job',
        annotation: 'Handler returns Err.',
      },
      {
        edgeId: 'e2',
        file: 'src/consumer.rs',
        line: 17,
        symbol: 'nack',
        annotation: 'Failure — requeue for retry (LPUSH).',
      },
      {
        edgeId: 'e5',
        file: 'src/queue.rs',
        line: 41,
        symbol: 'nack',
        annotation: 'Redis write puts the job back.',
      },
    ],
  },
];

export const title = 'Tokio job worker';

export const description =
  'Rust **Tokio** background worker: connect a Redis queue, dequeue forever, dispatch handlers, **ack** on success and **nack** on failure. Open **Flows** for the happy path and the retry path.';
