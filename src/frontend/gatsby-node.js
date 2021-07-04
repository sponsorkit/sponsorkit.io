/**
 * Implement Gatsby's Node APIs in this file.
 *
 * See: https://www.gatsbyjs.com/docs/node-apis/
 */
const webpackConfig = require("./webpack.config");

exports.onCreatePage = async ({ page, actions }) => {
  const { createPage } = actions;
}

exports.onCreateWebpackConfig = ({ actions }) => {
  actions.setWebpackConfig(webpackConfig);
};