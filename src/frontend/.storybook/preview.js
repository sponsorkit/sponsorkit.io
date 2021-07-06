import { addDecorator } from '@storybook/react';
import Layout from "../plugins/gatsby-plugin-top-layout/layout";

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
  <Layout>
    {story()}
  </Layout>
));