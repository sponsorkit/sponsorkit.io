const webpackConfig = require("../webpack.config");

module.exports = {
  "stories": [
    "../src/**/*.stories.mdx",
    "../src/**/*.stories.@(js|jsx|ts|tsx)"
  ],
  "addons": [
    "@storybook/addon-links",
    "@storybook/addon-essentials"
  ],
  core: {
    builder: "webpack5",
  },
  webpackFinal: async (config, { configType }) => {
    config.resolve.alias = {...config.resolve.alias, ...webpackConfig.resolve.alias};
    config.module.rules = [...config.module.rules, ...webpackConfig.module.rules];
    return config;
  }
}