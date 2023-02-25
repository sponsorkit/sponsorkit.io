import ThemeConfig from '@theme';
import Head from 'next/head';
import React from "react";
import './_app.scss';

export default function App({ Component, pageProps }: any) {
    return <React.StrictMode>
        <Head>
            <meta
                name="viewport"
                content="minimum-scale=1, initial-scale=1, width=device-width, shrink-to-fit=no"
            />
            <link rel="stylesheet" href="https://fonts.googleapis.com/css?family=Roboto:300,400,500,700&amp;display=swap" />
        </Head>
        <ThemeConfig>
            <Component {...pageProps} />
        </ThemeConfig>
    </React.StrictMode>;
}