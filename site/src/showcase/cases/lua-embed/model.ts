import type {
  SubsystemComponent,
  SubsystemComponentEdge,
} from '@principal-ai/subsystems-react';
import type { SubsystemThroughline } from '@principal-ai/subsystems-react/dist/subsystem/model.js';

const PURL = 'pkg:github/you/lua-embed';

export const components: SubsystemComponent[] = [
  {
    id: 'main',
    process: 'lua-host',
    name: 'main',
    construct: 'function',
    symbol: 'main',
    role: 'entry',
    purl: PURL,
    file: 'host/main.c',
    purpose: 'C host — create Lua VM, register callbacks, run script.',
    layer: 1,
  },
  {
    id: 'host-log',
    process: 'lua-host',
    name: 'host_log',
    construct: 'function',
    symbol: 'host_log',
    purl: PURL,
    file: 'host/main.c',
    purpose: 'Native callback registered into Lua.',
    layer: 2,
  },
  {
    id: 'greet',
    process: 'lua-guest',
    name: 'greet',
    construct: 'function',
    symbol: 'greet',
    role: 'entry',
    purl: PURL,
    file: 'script.lua',
    purpose: 'Lua guest function — may call back into the host.',
    layer: 2,
  },
  {
    id: 'LuaVM',
    name: 'Lua VM',
    construct: 'external',
    role: 'service',
    file: '',
    purl: 'external',
    purpose: 'Embedded interpreter (lua_State).',
    layer: 3,
  },
];

export const edges: SubsystemComponentEdge[] = [
  { id: 'e0', from: 'main', to: 'LuaVM', mechanism: 'calls' },
  { id: 'e1', from: 'main', to: 'host-log', mechanism: 'registers-into' },
  { id: 'e2', from: 'main', to: 'greet', mechanism: 'calls' },
  { id: 'e3', from: 'greet', to: 'host-log', mechanism: 'calls' },
];

export const throughlines: SubsystemThroughline[] = [
  {
    id: 'tl-embed',
    title: 'Host runs Lua (with callback)',
    steps: [
      { edgeId: 'e0', file: 'host/main.c', line: 16, symbol: 'luaL_newstate', annotation: 'Create the embedded VM.' },
      { edgeId: 'e1', file: 'host/main.c', line: 18, symbol: 'lua_register(host_log)', annotation: 'Expose a native function to Lua.' },
      { edgeId: 'e0', file: 'host/main.c', line: 20, symbol: 'luaL_dofile', annotation: 'Load script.lua into the VM.' },
      { edgeId: 'e2', file: 'host/main.c', line: 27, symbol: 'lua_pcall(greet)', annotation: 'Host calls into the guest.' },
      { edgeId: 'e3', file: 'script.lua', line: 3, symbol: 'host_log', annotation: 'Guest calls back into native host_log.' },
      { edgeId: 'e3', file: 'host/main.c', line: 11, symbol: 'printf', annotation: 'Native side effect from the callback.' },
    ],
  },
];

export const title = 'Lua embedded in C';
export const description =
  'Scripting-island pattern: **C host** embeds a **Lua VM**, calls `greet`, and Lua calls back via `host_log`. Open **Flows** for the round trip.';
