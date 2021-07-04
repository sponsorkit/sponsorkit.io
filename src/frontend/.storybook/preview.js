import { addDecorator } from '@storybook/react';
import ThemeConfig from "@theme";

export const parameters = {
  actions: { argTypesRegex: "^on[A-Z].*" },
  controls: {
    matchers: {
      color: /(background|color)$/i,
      date: /Date$/,
    },
  },
}

addDecorator((story) => (
  <ThemeConfig>
    <>
    {story()}
    </>
  </ThemeConfig>
));