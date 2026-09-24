import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";
import type { StorybookConfig } from "@storybook/react-vite";

const here = path.dirname(fileURLToPath(import.meta.url));
const realRpc = path.resolve(here, "../src/mainview/rpc");
const rpcMock = path.resolve(here, "mocks/rpc.ts");

/**
 * The real `src/mainview/rpc.ts` constructs `new Electrobun.Electroview(...)` at
 * import time (rpc.ts:165), which needs the electrobun host bridge. Storybook
 * runs in a plain browser, so every relative `../rpc` / `./rpc` import is
 * redirected to a canned mock that stories can shape.
 */
function stubStudioRpc(): Plugin {
  return {
    name: "stub-studio-rpc",
    enforce: "pre",
    resolveId(source, importer) {
      if (!importer || !source.startsWith(".")) return null;
      const resolved = path
        .resolve(path.dirname(importer), source)
        .replace(/\.tsx?$/, "");
      return resolved === realRpc ? rpcMock : null;
    },
  };
}

const config: StorybookConfig = {
  stories: ["../src/**/*.mdx", "../src/**/*.stories.@(js|jsx|mjs|ts|tsx)"],
  addons: ["@storybook/addon-links", "@storybook/addon-docs"],
  framework: {
    name: "@storybook/react-vite",
    options: {},
  },
  // The studio is on TypeScript 6; skip docgen to avoid version friction.
  typescript: {
    check: false,
    reactDocgen: false,
  },
  viteFinal(config) {
    config.plugins = [stubStudioRpc(), ...(config.plugins ?? [])];
    if (config.resolve) {
      config.resolve.alias = {
        ...config.resolve.alias,
        "@storybook/blocks": "@storybook/addon-docs/blocks",
      };
    }
    return config;
  },
};

export default config;
