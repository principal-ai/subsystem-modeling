import type { ShowcaseCaseMeta } from '../types';

export const meta: ShowcaseCaseMeta = {
  id: 'lua-embed',
  shortTitle: 'Lua embedded in C',
  blurb: 'C host embeds Lua; guest calls back into native host_log.',
  stack: 'C + Lua',
  axes: ['stack', 'insight', 'shape'],
  complexity: 'medium',
  storyTitle: 'C/Lua embed',
};
