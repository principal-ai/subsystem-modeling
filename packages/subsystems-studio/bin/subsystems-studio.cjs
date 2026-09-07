#!/usr/bin/env node
/**
 * Bin shim for `@principal-ai/subsystems-studio`.
 *
 * Locates the platform-specific .app bundle shipped under `bundles/<os>-<arch>/`
 * and execs its launcher with argv + env passthrough. macOS arm64 is the only
 * platform packaged today; the package.json's `os`/`cpu` filters keep npm from
 * installing it on others, but a defensive check here gives a clearer error if
 * someone sets up an environment that bypasses those filters.
 */

const { spawn } = require('node:child_process');
const { existsSync } = require('node:fs');
const { join } = require('node:path');

const platform = process.platform;
const arch = process.arch;

if (platform !== 'darwin' || arch !== 'arm64') {
  process.stderr.write(
    `subsystems-studio: no prebuilt bundle for ${platform}-${arch} yet. Currently only darwin-arm64 is shipped.\n`,
  );
  process.exit(1);
}

const bundleRoot = join(__dirname, '..', 'bundles', 'macos-arm64', 'subsystems-studio.app');
const launcher = join(bundleRoot, 'Contents', 'MacOS', 'launcher');

if (!existsSync(launcher)) {
  process.stderr.write(
    `subsystems-studio: launcher missing at ${launcher}. The package may have been installed without its bundle.\n`,
  );
  process.exit(1);
}

const child = spawn(launcher, process.argv.slice(2), {
  stdio: 'inherit',
  env: process.env,
});

child.on('error', (err) => {
  process.stderr.write(`subsystems-studio: failed to launch — ${err.message}\n`);
  process.exit(1);
});

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 0);
});
