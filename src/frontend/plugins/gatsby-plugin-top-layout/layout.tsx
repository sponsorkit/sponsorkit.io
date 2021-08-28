/**
 * Layout component that queries for data
 * with Gatsby's useStaticQuery component
 *
 * See: https://www.gatsbyjs.com/docs/use-static-query/
 */

import { LocationProvider } from "@reach/router";
import * as React from "react";
import Helmet from 'react-helmet';
import { createGenerateId, JssProvider } from 'react-jss';
import ThemeConfig from '../../src/theme';
import "./layout.scss";

const generateId = createGenerateId();

export default function ({ children }: any) {
  return (<>
    <Helmet>
      <meta
        name="viewport"
        content="minimum-scale=1, initial-scale=1, width=device-width, shrink-to-fit=no"
      />
      <link rel="stylesheet" href="https://fonts.googleapis.com/css?family=Roboto:300,400,500,700&amp;display=swap" />
    </Helmet>
    <JssProvider generateId={generateId}>
      <ThemeConfig>
        <LocationProvider>
          {children}
        </LocationProvider>
      </ThemeConfig>
    </JssProvider>
  </>)
}
