import type { Meta, StoryObj } from "@storybook/react";
import { GraphifyCliModal } from "./GraphifyCliModal";

const installed = {
  installed: true,
  bin: "/usr/local/bin/graphify",
  conventionalBin: "/usr/local/bin/graphify",
  installCommand: "npm i -g graphify",
  installedVersion: "0.5.0",
  latestVersion: "0.5.0",
  updateAvailable: false,
  cliBusy: null,
} as const;

const meta = {
  title: "Maintenance/GraphifyCliModal",
  component: GraphifyCliModal,
  parameters: { layout: "fullscreen" },
  args: {
    initial: installed,
    onClose: () => {},
    onChanged: () => {},
  },
} satisfies Meta<typeof GraphifyCliModal>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Installed: Story = {};

export const UpdateAvailable: Story = {
  args: {
    initial: { ...installed, installedVersion: "0.4.1", updateAvailable: true },
  },
};

export const NotInstalled: Story = {
  args: {
    initial: {
      ...installed,
      installed: false,
      bin: null,
      installedVersion: null,
      updateAvailable: null,
    },
  },
};
