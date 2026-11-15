# Studio theme bridge

Studio exposes loopback-only theme routes on the same HTTP bridge as its model
API (port `3045` in release builds, `3046` in development).

Read the active theme and the supported property paths first:

```sh
curl -s http://127.0.0.1:3045/theme/schema
```

Switch the active theme using an available `name` from `availableThemes`:

```sh
curl -s -X POST http://127.0.0.1:3045/theme/select \
  -H 'content-type: application/json' \
  -d '{"themeName":"matrix"}'
```

Update a supported theme property. Updates are persisted per theme, and active
theme changes are applied to all Studio windows immediately:

```sh
curl -s -X POST http://127.0.0.1:3045/theme/update \
  -H 'content-type: application/json' \
  -d '{"propertyPath":"colors.primary","value":"#d4a574"}'
```

Pass `themeName` to `/theme/update` to edit a theme without activating it. The
response then includes a warning and the currently active theme. Property paths
and their value types come from `GET /theme/schema`; unsupported paths and
cross-origin requests are rejected.
