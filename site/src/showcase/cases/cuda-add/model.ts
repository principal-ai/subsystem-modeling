import type {
  SubsystemComponent,
  SubsystemTrail,
} from '@principal-ai/subsystems-react';

const PURL = 'pkg:github/you/cuda-add';

export const components: SubsystemComponent[] = [
  {
    alias: 'main',
    process: 'cuda-host',
    name: 'main',
    construct: 'function',
    symbol: 'main',
    role: 'entry',
    purl: PURL,
    file: 'src/main.cu',
    declarationSpan: {
      startLine: 9,
      endLine: 9,
      contentHash: '775b36031c81d0d71f6c4f6b390810ed',
    },
    purpose: 'Host — alloc, HtoD, launch, DtoH.',
    layer: 1,
  },
  {
    alias: 'add-kernel',
    process: 'cuda-device',
    name: 'add_kernel',
    construct: 'function',
    symbol: 'add_kernel',
    role: 'entry',
    framework: 'cuda',
    stereotype: 'kernel',
    purl: PURL,
    file: 'src/add_kernel.cu',
    declarationSpan: {
      startLine: 2,
      endLine: 2,
      contentHash: '3a36562190f49e15062af380af65a9c0',
    },
    purpose: 'Device kernel — element-wise add on the GPU.',
    layer: 2,
  },
  {
    alias: 'GPU',
    name: 'GPU',
    construct: 'external',
    role: 'service',
    file: '',
    purl: 'external',
    purpose: 'CUDA device — memory + SMs.',
    layer: 3,
  },
];

export const trails: SubsystemTrail[] = [
  {
    id: 'tl-launch',
    title: 'Host → kernel → host',
    steps: [
      { from: 'main', to: 'GPU', mechanism: 'writes', file: 'src/main.cu', span: { startLine: 26, endLine: 26, contentHash: '7ed0e239d4faab45f42f1c712cc384ba' }, purl: PURL, symbol: 'cudaMemcpy(HtoD)', annotation: 'Upload inputs to device memory.' },
      { from: 'main', to: 'add-kernel', mechanism: 'calls', file: 'src/main.cu', span: { startLine: 29, endLine: 29, contentHash: '349f9d3b005279005a9f8bd00b2d3ded' }, purl: PURL, symbol: 'add_kernel<<<>>>', annotation: 'Launch the device grid.' },
      { from: 'add-kernel', to: 'GPU', mechanism: 'reads', file: 'src/add_kernel.cu', span: { startLine: 5, endLine: 5, contentHash: '06babab018639b6fdec6b4ab807e14f5' }, purl: PURL, symbol: 'out[i] = a[i] + b[i]', annotation: 'Each thread reads device memory and writes the sum.' },
      { from: 'main', to: 'GPU', mechanism: 'reads', file: 'src/main.cu', span: { startLine: 32, endLine: 32, contentHash: '91e97e53b628ef948d0f374adcefca3c' }, purl: PURL, symbol: 'cudaMemcpy(DtoH)', annotation: 'Copy results back to the host.' },
    ],
  },
];

export const title = 'CUDA vector add';
export const description =
  'GPU compute path: **host** copies buffers to the **device**, launches `add_kernel`, then copies results back. Open **Trails** for the HtoD → launch → DtoH trail.';
