import type { Preview } from "@storybook/react";
import { ThemeProvider, slateNeonTheme } from "@principal-ade/industry-theme";

const preview: Preview = {
  parameters: {
    layout: "fullscreen",
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
  },
  decorators: [
    (Story) => (
      <ThemeProvider theme={slateNeonTheme}>
        <div
          style={{
            minHeight: "100vh",
            padding: 24,
            background: slateNeonTheme.colors.background,
            color: slateNeonTheme.colors.text,
            fontFamily: slateNeonTheme.fonts.body,
          }}
        >
          <Story />
        </div>
      </ThemeProvider>
    ),
  ],
};

export default preview;
