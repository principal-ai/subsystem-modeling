import type { Meta, StoryObj } from "@storybook/react";
import { IntegrationModal } from "./IntegrationTools";

/**
 * `IntegrationSpec` is a container-bound object, so the story hand-rolls a
 * minimal one. `mark`/`extra` are omitted — the modal renders the header and
 * status block the same without them.
 */
const spec = {
  id: "graphify",
  name: "Graphify",
  tagline: "Code knowledge graph",
  usage: "Builds the code graph Studio audits subsystem models against.",
  homepage: "https://github.com/Graphify-Labs/graphify",
  homepageLabel: "Graphify-Labs/graphify",
  mark: () => null,
  getStatus: async () => ({
    installed: true,
    bin: "/usr/local/bin/graphify",
    installedVersion: "0.5.0",
    latestVersion: "0.5.0",
    updateAvailable: false,
    cliBusy: null,
  }),
  install: async () => ({ ok: true }),
  update: async () => ({ ok: true }),
  uninstall: async () => ({ ok: true }),
  subscribe: () => () => {},
} as never;

const status = {
  installed: true,
  bin: "/usr/local/bin/graphify",
  installedVersion: "0.5.0",
  latestVersion: "0.5.0",
  updateAvailable: false,
  cliBusy: null,
} as never;

const meta = {
  title: "Maintenance/IntegrationModal",
  component: IntegrationModal,
  parameters: { layout: "fullscreen" },
  args: {
    spec,
    initial: status,
    onClose: () => {},
    onStatus: () => {},
  },
} satisfies Meta<typeof IntegrationModal>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Installed: Story = {};
