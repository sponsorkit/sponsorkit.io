module.exports = {
  siteMetadata: {
    title: `Gatsby Default Starter`,
    description: `Kick off your next, great Gatsby project with this default starter. This barebones starter ships with the main Gatsby configuration files you might need.`,
    author: `@gatsbyjs`,
  },
  flags: {
    PRESERVE_WEBPACK_CACHE: true,
    FAST_DEV: true,
    LMDB_STORE: true
  },
  plugins: [
    `gatsby-plugin-remove-trailing-slashes`,
    `gatsby-plugin-sass`,
    'gatsby-plugin-top-layout',
    `gatsby-plugin-material-ui`,
    `gatsby-plugin-styled-components`,
    `gatsby-plugin-react-helmet`,
    `gatsby-plugin-image`,
    {
      resolve: 'gatsby-plugin-react-svg',
      options: {
        rule: {
          include: /\.inline\.svg$/,
        },
      },
    },
    `gatsby-transformer-sharp`,
    `gatsby-plugin-gatsby-cloud`
  ],
}
