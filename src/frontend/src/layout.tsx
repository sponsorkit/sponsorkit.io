import Head from 'next/head';
import * as React from "react";
import ThemeConfig from '../src/theme';
import "./layout.scss";

export default function ({ children }: any) {
  return (<React.StrictMode>
    <Head>
      <meta
        name="viewport"
        content="minimum-scale=1, initial-scale=1, width=device-width, shrink-to-fit=no"
      />
      <link rel="stylesheet" href="https://fonts.googleapis.com/css?family=Roboto:300,400,500,700&amp;display=swap" />
    </Head>
    <ThemeConfig>
      {children}
    </ThemeConfig>
  </React.StrictMode>)
}
