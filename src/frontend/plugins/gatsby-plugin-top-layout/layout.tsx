import { LocationProvider } from "@reach/router";
import * as React from "react";
import Helmet from 'react-helmet';
import ThemeConfig from '../../src/theme';
import "./layout.scss";

export default function ({ children }: any) {
  return (<>
    <Helmet>
      <meta
        name="viewport"
        content="minimum-scale=1, initial-scale=1, width=device-width, shrink-to-fit=no"
      />
      <link rel="stylesheet" href="https://fonts.googleapis.com/css?family=Roboto:300,400,500,700&amp;display=swap" />
    </Helmet>
    <ThemeConfig>
      <LocationProvider>
        {children}
      </LocationProvider>
    </ThemeConfig>
  </>)
}
