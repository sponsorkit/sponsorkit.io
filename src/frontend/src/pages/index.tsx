import { AppBar, Box, Container, Toolbar, Typography } from "@mui/material";
import { combineClassNames } from "@utils/strings";
import { navigate } from "gatsby-link";
import { forwardRef, useEffect } from "react";
import BountyhuntBlueIcon from './assets/Bountyhunt-blue.inline.svg';
import SponsorkitBlueIcon from './assets/Sponsorkit-blue.inline.svg';
import * as classes from "./index.module.scss";

export default function IndexPage() {
  useEffect(
    () => {
      navigate("/bounties/view");
    },
    []);
  return null;
}



const BountyhuntLogo = forwardRef(function (
  props: {
    href?: string,
    target?: string
  }, 
  ref: React.Ref<HTMLAnchorElement>) 
{
  return <a 
    href="https://bountyhunt.io"
    {...props}
    ref={ref} 
    className={combineClassNames(
      classes.logo, 
      classes.bountyhunt)}
  >
    <BountyhuntBlueIcon className={classes.image} />
    <Box className={classes.textContainer}>
      <Typography className={classes.mainText}>bountyhunt.io</Typography>
      <Typography className={classes.secondaryText}>by sponsorkit.io</Typography>
    </Box>
  </a>
});

const SponsorkitLogo = forwardRef(function (
  props: {
    href?: string,
    target?: string
  }, 
  ref: React.Ref<HTMLAnchorElement>) 
{
  return <a 
    href="https://sponsorkit.io"
    {...props}
    ref={ref} 
    className={combineClassNames(
      classes.logo, 
      classes.sponsorkit)}
  >
    <SponsorkitBlueIcon className={classes.image} />
    <Box className={classes.textContainer}>
      <Typography className={classes.mainText}>sponsorkit.io</Typography>
    </Box>
  </a>
});

export function AppBarTemplate(props: {
  logoVariant: "sponsorkit" | "bountyhunt",
  children: React.ReactNode,
  className?: string
}) {
  return <>
    <AppBar color="default" className={classes.appBar}>
      <Toolbar>
        <Container maxWidth="lg">
          <Logo variant={props.logoVariant} />
        </Container>
      </Toolbar>
    </AppBar>
    <Box className={combineClassNames(classes.spacer, classes.top)} />
    <Container maxWidth="lg" className={combineClassNames(classes.contentRoot, props.className)}>
      {props.children}
    </Container>
    <Box className={combineClassNames(classes.spacer, classes.bottom)} />
    <Footer />
  </>
}

const Logo = forwardRef(function (
  props: {
    variant: "sponsorkit" | "bountyhunt",
    href?: string,
    target?: string
  },
  ref: React.Ref<HTMLAnchorElement>
) {
  return props.variant === "bountyhunt" ?
    <BountyhuntLogo {...props} ref={ref} /> :
    <SponsorkitLogo {...props} ref={ref} />;
});

function Footer() {
  return <Box className={classes.footer}>
    <Container maxWidth="lg" className={classes.container}>
      <Logo 
        href="https://github.com/sponsorkit" 
        target="_blank" 
        variant="sponsorkit" />
      <Box className={classes.sections}>
        <FooterSection title="bountyhunt.io">
          <FooterLink 
            text="Become a bountyhunter"
            href="/dashboard" />
          <FooterLink 
            text="Top bounties"
            href="/bounties" />
        </FooterSection>
        <FooterSection title="GitHub">
          <FooterLink 
            text="File an issue"
            href="https://github.com/sponsorkit/sponsorkit.io/issues/new"
            target="_blank" />
          <FooterLink 
            text="Browse code"
            href="https://github.com/sponsorkit/sponsorkit.io" />
        </FooterSection>
      </Box>
    </Container>
  </Box>;
}

function FooterSection(props: {
  title: React.ReactNode,
  children: React.ReactNode
}) {
  return <Box className={classes.section}>
    <Box className={classes.title}>
        {props.title}
    </Box>
    <Box className={classes.links}>
      {props.children}
    </Box>
  </Box>;
}

function FooterLink(props: {
  text: React.ReactNode,
  href: string,
  target?: string
}) {
  return <a 
    href={props.href} 
    target={props.target}
    className={classes.link}
  >
    {props.text}
  </a>
}
