import type { Meta, StoryObj } from "@storybook/react";
import { IdentityModal } from "./AppHeader";

const meta = {
  title: "Maintenance/IdentityModal",
  component: IdentityModal,
  parameters: { layout: "fullscreen" },
  args: {
    user: {
      login: "octocat",
      name: "Octo Cat",
      avatarUrl: "https://avatars.githubusercontent.com/u/583231?v=4",
      htmlUrl: "https://github.com/octocat",
      source: "gh",
      git: { name: "Octo Cat", email: "octo@example.com" },
    },
    onClose: () => {},
    onOpenProfile: () => {},
  },
} satisfies Meta<typeof IdentityModal>;

export default meta;
type Story = StoryObj<typeof meta>;

export const SignedIn: Story = {};

export const GitOnly: Story = {
  args: {
    user: {
      source: "git",
      git: { name: "Octo Cat", email: "octo@example.com" },
    },
  },
};
