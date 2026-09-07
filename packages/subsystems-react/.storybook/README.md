# Storybook Configuration

This directory contains the Storybook configuration for the Visual Validation React library.

## Running Storybook

From the monorepo root:

```bash
bun run storybook
```

Or from the react package:

```bash
cd packages/subsystems-react
bun run storybook
```

Storybook will start on http://localhost:6006

## Building Storybook

To build a static version:

```bash
bun run build-storybook
```

## Adding Stories

Stories are located in `src/stories/`. Each component should have a corresponding `.stories.tsx` file.

Example story structure:

```tsx
import type { Meta, StoryObj } from '@storybook/react';
import { YourComponent } from '../components/YourComponent';

const meta = {
  title: 'Components/YourComponent',
  component: YourComponent,
  tags: ['autodocs'],
} satisfies Meta<typeof YourComponent>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    // component props
  },
};
```

## Configuration Files

- `main.ts` - Main Storybook configuration
- `preview.ts` - Global preview settings and parameters
