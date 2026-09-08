import type {
  SubsystemComponent,
  SubsystemComponentEdge,
} from '@principal-ai/subsystems-react';
import type { SubsystemThroughline } from '@principal-ai/subsystems-react/dist/subsystem/model.js';

const PURL = 'pkg:github/you/cuda-add';

export const components: SubsystemComponent[] = [
  {
    id: 'main',
    process: 'cuda-host',
    name: 'main',
    construct: 'function',
    symbol: 'main',
    role: 'entry',
    purl: PURL,
    file: 'src/main.cu',
    purpose: 'Host — alloc, HtoD, launch, DtoH.',
    layer: 1,
  },
  {
    id: 'add-kernel',
    process: 'cuda-device',
    name: 'add_kernel',
    construct: 'function',
    symbol: 'add_kernel',
    role: 'entry',
    framework: 'cuda',
    stereotype: 'kernel',
    purl: PURL,
    file: 'src/add_kernel.cu',
    purpose: 'Device kernel — element-wise add on the GPU.',
    layer: 2,
  },
  {
    id: 'GPU',
    name: 'GPU',
    construct: 'external',
    role: 'service',
    file: '',
    purl: 'external',
    purpose: 'CUDA device — memory + SMs.',
    layer: 3,
  },
];

export const edges: SubsystemComponentEdge[] = [
  { id: 'e0', from: 'main', to: 'GPU', mechanism: 'writes' },
  { id: 'e1', from: 'main', to: 'add-kernel', mechanism: 'calls' },
  { id: 'e2', from: 'add-kernel', to: 'GPU', mechanism: 'reads' },
  { id: 'e3', from: 'add-kernel', to: 'GPU', mechanism: 'writes' },
  { id: 'e4', from: 'main', to: 'GPU', mechanism: 'reads' },
];

export const throughlines: SubsystemThroughline[] = [
  {
    id: 'tl-launch',
    title: 'Host → kernel → host',
    steps: [
      { edgeId: 'e0', file: 'src/main.cu', line: 26, symbol: 'cudaMemcpy(HtoD)', annotation: 'Upload inputs to device memory.' },
      { edgeId: 'e1', file: 'src/main.cu', line: 29, symbol: 'add_kernel<<<>>>', annotation: 'Launch the device grid.' },
      { edgeId: 'e2', file: 'src/add_kernel.cu', line: 5, symbol: 'out[i] = a[i] + b[i]', annotation: 'Each thread reads device memory and writes the sum.' },
      { edgeId: 'e4', file: 'src/main.cu', line: 32, symbol: 'cudaMemcpy(DtoH)', annotation: 'Copy results back to the host.' },
    ],
  },
];

export const title = 'CUDA vector add';
export const description =
  'GPU compute path: **host** copies buffers to the **device**, launches `add_kernel`, then copies results back. Open **Flows** for the HtoD → launch → DtoH throughline.';
