/**
 * Layout component that queries for data
 * with Gatsby's useStaticQuery component
 *
 * See: https://www.gatsbyjs.com/docs/use-static-query/
 */

import * as React from "react"
import { useStaticQuery, graphql } from "gatsby"

import Helmet from 'react-helmet';

import "./layout.css"
import { Container } from "@material-ui/core";

export default function({children}: any) {
  return (
    <>
      <Helmet>
        <link rel="stylesheet" href="https://fonts.googleapis.com/css?family=Roboto:300,400,500,700&amp;display=swap" />
      </Helmet>
      <div>
        <main>{children}</main>
      </div>
    </>
  )
}
