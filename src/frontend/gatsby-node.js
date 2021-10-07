/**
 * Implement Gatsby's Node APIs in this file.
 *
 * See: https://www.gatsbyjs.com/docs/node-apis/
 */
const webpackConfig = require("./webpack.config");

exports.onCreatePage = async ({ page, actions }) => {
  const { createPage, deletePage } = actions;

  if (page.path.match(/\.stories$/)) {
    console.info("removing stories page", page.path);
    deletePage(page);
  }
}

exports.onCreateWebpackConfig = ({ actions }) => {
  console.log("webpack-config", webpackConfig);
  actions.setWebpackConfig(webpackConfig);
};