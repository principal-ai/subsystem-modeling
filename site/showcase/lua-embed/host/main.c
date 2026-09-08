/**
 * C host embeds Lua — load a script, call a Lua function, allow Lua to call back.
 */
#include <stdio.h>
#include <lua.h>
#include <lauxlib.h>
#include <lualib.h>

static int host_log(lua_State *L) {
  const char *msg = luaL_checkstring(L, 1);
  printf("[host] %s\n", msg);
  return 0;
}

int main(void) {
  lua_State *L = luaL_newstate();
  luaL_openlibs(L);
  lua_register(L, "host_log", host_log);

  if (luaL_dofile(L, "script.lua") != LUA_OK) {
    fprintf(stderr, "%s\n", lua_tostring(L, -1));
    return 1;
  }

  lua_getglobal(L, "greet");
  lua_pushstring(L, "world");
  if (lua_pcall(L, 1, 1, 0) != LUA_OK) {
    fprintf(stderr, "%s\n", lua_tostring(L, -1));
    return 1;
  }

  printf("%s\n", lua_tostring(L, -1));
  lua_close(L);
  return 0;
}
