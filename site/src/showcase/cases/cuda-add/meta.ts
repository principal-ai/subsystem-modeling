import type { ShowcaseCaseMeta } from '../types';

export const meta: ShowcaseCaseMeta = {
  id: 'cuda-add',
  shortTitle: 'CUDA vector add',
  blurb: 'Host HtoD → device kernel → DtoH on the GPU.',
  stack: 'CUDA',
  axes: ['stack', 'insight'],
  complexity: 'medium',
  storyTitle: 'CUDA/Vector add',
};
