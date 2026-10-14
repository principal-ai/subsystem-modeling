import type {
  SubsystemComponent,
  SubsystemTrail,
} from '@principal-ai/subsystems-react';

const PURL = 'pkg:github/you/lua-embed';

export const components: SubsystemComponent[] = [
  {
    alias: 'main',
    process: 'lua-host',
    name: 'main',
    construct: 'function',
    symbol: 'main',
    role: 'entry',
    purl: PURL,
    file: 'host/main.c',
    declarationSpan: {
      startLine: 15,
      endLine: 15,
      contentHash: '65dbda96d1562ee5fada6112f438aa29',
    },
    purpose: 'C host — create Lua VM, register callbacks, run script.',
    layer: 1,
  },
  {
    alias: 'host-log',
    process: 'lua-host',
    name: 'host_log',
    construct: 'function',
    symbol: 'host_log',
    purl: PURL,
    file: 'host/main.c',
    declarationSpan: {
      startLine: 9,
      endLine: 9,
      contentHash: '2f0e0bff8dbd3563e9d2e0989acff992',
    },
    purpose: 'Native callback registered into Lua.',
    layer: 2,
  },
  {
    alias: 'greet',
    process: 'lua-guest',
    name: 'greet',
    construct: 'function',
    symbol: 'greet',
    role: 'entry',
    purl: PURL,
    file: 'script.lua',
    declarationSpan: {
      startLine: 2,
      endLine: 2,
      contentHash: '08cfc0508704758efd7c24e96ff57b60',
    },
    purpose: 'Lua guest function — may call back into the host.',
    layer: 2,
  },
  {
    alias: 'LuaVM',
    name: 'Lua VM',
    construct: 'external',
    role: 'service',
    file: '',
    purl: 'external',
    purpose: 'Embedded interpreter (lua_State).',
    layer: 3,
  },
];

export const trails = [
  {
    "id": "tl-embed",
    "title": "Host runs Lua (with callback)",
    "steps": [
      {
        "from": "main",
        "to": "LuaVM",
        "mechanism": "calls",
        "file": "host/main.c",
        "span": {
          "startLine": 16,
          "endLine": 16,
          "contentHash": "84bfab6b97415276aaf6fc3d4f66ec68"
        },
        "purl": PURL,
        "symbol": "luaL_newstate",
        "annotation": "Create the embedded VM."
      },
      {
        "from": "main",
        "to": "host-log",
        "mechanism": "registers-into",
        "file": "host/main.c",
        "span": {
          "startLine": 18,
          "endLine": 18,
          "contentHash": "94b9d2a7232270c2233c2bea74bd48fc"
        },
        "purl": PURL,
        "symbol": "lua_register(host_log)",
        "annotation": "Expose a native function to Lua."
      },
      {
        "from": "main",
        "to": "LuaVM",
        "mechanism": "calls",
        "file": "host/main.c",
        "span": {
          "startLine": 20,
          "endLine": 20,
          "contentHash": "a0cd1de6f614b18dd396ee87c9e438d2"
        },
        "purl": PURL,
        "symbol": "luaL_dofile",
        "annotation": "Load script.lua into the VM."
      },
      {
        "from": "main",
        "to": "greet",
        "mechanism": "calls",
        "file": "host/main.c",
        "span": {
          "startLine": 27,
          "endLine": 27,
          "contentHash": "fe75667b35e78e3be7f203a67ed6fc65"
        },
        "purl": PURL,
        "symbol": "lua_pcall(greet)",
        "annotation": "Host calls into the guest."
      },
      {
        "from": "greet",
        "to": "host-log",
        "mechanism": "calls",
        "file": "script.lua",
        "span": {
          "startLine": 3,
          "endLine": 3,
          "contentHash": "3be9861c3bdab827d245abc79ada9677"
        },
        "purl": PURL,
        "symbol": "host_log",
        "annotation": "Guest calls back into native host_log."
      },
      {
        "from": "greet",
        "to": "host-log",
        "mechanism": "calls",
        "file": "host/main.c",
        "span": {
          "startLine": 11,
          "endLine": 11,
          "contentHash": "02cd3a913984d84f8a69870f85a2ee70"
        },
        "purl": PURL,
        "symbol": "printf",
        "annotation": "Native side effect from the callback."
      }
    ]
  }
] as SubsystemTrail[];

export const title = 'Lua embedded in C';
export const description =
  'Scripting-island pattern: **C host** embeds a **Lua VM**, calls `greet`, and Lua calls back via `host_log`. Open **Trails** for the round trip.';
