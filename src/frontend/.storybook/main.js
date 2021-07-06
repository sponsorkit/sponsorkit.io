const webpackConfig = require("../webpack.config");

const path = require("path")
const toPath = (filePath) => path.join(process.cwd(), filePath);

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
    config.resolve.alias = { 
      ...config.resolve.alias, 
      ...webpackConfig.resolve.alias,
      ...getStorybookHackAliases()
    };
    config.module.rules = [
      ...config.module.rules,
      {
        test: /\.s?css$/i,
        use: [
          "style-loader",
          "css-loader",
          "sass-loader",
        ],
      }
    ];
    return config;
  }
}

/**
 * these is needed due to a storybook issue where styling is not applied: https://github.com/storybookjs/storybook/issues/13145
 */
function getStorybookHackAliases() {
  return [
    "@emotion/core", toPath("node_modules/@emotion/react"),
    "emotion-theming", toPath("node_modules/@emotion/react"),
    "@emotion/styled", require.resolve('@emotion/styled')
  ];
}
