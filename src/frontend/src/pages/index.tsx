import { AppBar, Box, Container, Toolbar, Typography } from "@material-ui/core";
import { combineClassNames } from "@utils/strings";
import { navigate } from "gatsby";
import { useEffect } from "react";
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

function BountyhuntLogo() {
    return <Box className={`${classes.logo} ${classes.bountyhunt}`}>
        <BountyhuntBlueIcon className={classes.image} />
        <Box className={classes.textContainer}>
            <Typography className={classes.mainText}>bountyhunt.io</Typography>
            <Typography className={classes.secondaryText}>by sponsorkit.io</Typography>
        </Box>
    </Box>
}

function SponsorkitLogo() {
    return <Box className={`${classes.logo} ${classes.sponsorkit}`}>
        <SponsorkitBlueIcon className={classes.image} />
        <Box className={classes.textContainer}>
            <Typography className={classes.mainText}>sponsorkit.io</Typography>
        </Box>
    </Box>
}

export function AppBarTemplate(props: {
  logoVariant: "sponsorkit"|"bountyhunt",
  children: React.ReactNode,
  className?: string
}) {
  return <>
    <AppBar color="default" className={classes.appBar}>
      <Toolbar>
        {props.logoVariant === "bountyhunt" ? 
          <BountyhuntLogo /> :
          <SponsorkitLogo />}
      </Toolbar>
    </AppBar>
    <Box className={combineClassNames(classes.spacer, classes.top)} />
    <Container maxWidth="lg" className={combineClassNames(classes.contentRoot, props.className)}>
      {props.children}
    </Container>
    <Box className={combineClassNames(classes.spacer, classes.top)} />
  </>
}
