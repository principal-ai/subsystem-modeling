import type { StorybookConfig } from '@storybook/react-vite';

const config: StorybookConfig = {
  stories: ['../src/**/*.mdx', '../src/**/*.stories.@(js|jsx|mjs|ts|tsx)'],
  addons: [
    '@storybook/addon-links',
    '@storybook/addon-docs',
  ],
  framework: {
    name: '@storybook/react-vite',
    options: {},
  },
  typescript: {
    check: false,
    reactDocgen: 'react-docgen-typescript',
    reactDocgenTypescriptOptions: {
      shouldExtractLiteralValuesFromEnum: true,
      propFilter: (prop) =>
        prop.parent ? !/node_modules/.test(prop.parent.fileName) : true,
    },
  },
  async viteFinal(config) {
    if (config.resolve) {
      config.resolve.alias = {
        ...config.resolve.alias,
        '@storybook/blocks': '@storybook/addon-docs/blocks',
        'handlebars': 'handlebars/dist/handlebars.js',
      };
    }

    // Include packages that need to be pre-bundled by Vite
    if (config.optimizeDeps) {
      config.optimizeDeps.include = [
        ...(config.optimizeDeps.include || []),
        '@principal-ai/subsystems-core',
        'handlebars',
      ];
    } else {
      config.optimizeDeps = {
        include: ['@principal-ai/subsystems-core', 'handlebars'],
      };
    }

    // Allow access to external canvas files from Backlog.md repository
    // and the package directory itself for Storybook modules. The principal-studio
    // package dir is included so the Concepts stories can import
    // ChangeTypeVisual from its source across the package boundary.
    if (config.server) {
      config.server.fs = {
        ...config.server.fs,
        allow: [
          ...(config.server.fs?.allow || []),
          '/Users/griever/Developer/backlog-adaptation/Backlog.md/.principal-views',
          '/Users/griever/Developer/visual-validation/principal-view-core-library/packages/subsystems-react',
          '/Users/griever/Developer/visual-validation/principal-view-core-library/packages/subsystems-studio',
        ],
      };
    } else {
      config.server = {
        fs: {
          allow: [
            '/Users/griever/Developer/backlog-adaptation/Backlog.md/.principal-views',
            '/Users/griever/Developer/visual-validation/principal-view-core-library/packages/subsystems-react',
            '/Users/griever/Developer/visual-validation/principal-view-core-library/packages/subsystems-studio',
          ],
        },
      };
    }

    return config;
  },
};

export default config;
