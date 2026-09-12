import type {
  SubsystemComponent,
  SubsystemRelation,
  SubsystemWalkthrough,
} from '@principal-ai/subsystems-react';

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

export const relations = [] as SubsystemRelation[];

export const walkthroughs = [
  {
    "id": "tl-embed",
    "title": "Host runs Lua (with callback)",
    "steps": [
      {
        "from": "main",
        "to": "LuaVM",
        "mechanism": "calls",
        "file": "host/main.c",
        "line": 16,
        "symbol": "luaL_newstate",
        "annotation": "Create the embedded VM."
      },
      {
        "from": "main",
        "to": "host-log",
        "mechanism": "registers-into",
        "file": "host/main.c",
        "line": 18,
        "symbol": "lua_register(host_log)",
        "annotation": "Expose a native function to Lua."
      },
      {
        "from": "main",
        "to": "LuaVM",
        "mechanism": "calls",
        "file": "host/main.c",
        "line": 20,
        "symbol": "luaL_dofile",
        "annotation": "Load script.lua into the VM."
      },
      {
        "from": "main",
        "to": "greet",
        "mechanism": "calls",
        "file": "host/main.c",
        "line": 27,
        "symbol": "lua_pcall(greet)",
        "annotation": "Host calls into the guest."
      },
      {
        "from": "greet",
        "to": "host-log",
        "mechanism": "calls",
        "file": "script.lua",
        "line": 3,
        "symbol": "host_log",
        "annotation": "Guest calls back into native host_log."
      },
      {
        "from": "greet",
        "to": "host-log",
        "mechanism": "calls",
        "file": "host/main.c",
        "line": 11,
        "symbol": "printf",
        "annotation": "Native side effect from the callback."
      }
    ]
  }
] as SubsystemWalkthrough[];

export const title = 'Lua embedded in C';
export const description =
  'Scripting-island pattern: **C host** embeds a **Lua VM**, calls `greet`, and Lua calls back via `host_log`. Open **Walkthroughs** for the round trip.';
