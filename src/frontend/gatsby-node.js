/**
 * Implement Gatsby's Node APIs in this file.
 *
 * See: https://www.gatsbyjs.com/docs/node-apis/
 */
const webpackConfig = require("./webpack.config");

exports.onCreatePage = async ({ page, actions }) => {
  const { createPage, deletePage } = actions;

  if (page.path.match(/\.stories$/)) {
    console.warn("removing stories page", page);
    deletePage(page);
  }
}

exports.onCreateWebpackConfig = ({ actions }) => {
  actions.setWebpackConfig(webpackConfig);
};