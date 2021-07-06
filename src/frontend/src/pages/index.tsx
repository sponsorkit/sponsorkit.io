import { AppBar, Box, Button, Container, Toolbar, Typography } from "@material-ui/core"
import * as React from "react"
import * as classes from "./index.module.scss";
import BountyhuntBlueIcon from './assets/Bountyhunt-blue.inline.svg';
import SponsorkitBlueIcon from './assets/Sponsorkit-blue.inline.svg';

const IndexPage = () => (
  <>
    <Button color="primary" variant="contained" style={{
      margin: 16
    }}>
      Click me, and get disappointed
    </Button>
  </>
)

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
  children: React.ReactNode
}) {
  return <>
    <AppBar color="default" className={classes.appBar}>
      <Toolbar>
        {props.logoVariant === "bountyhunt" ? 
          <BountyhuntLogo /> :
          <SponsorkitLogo />}
      </Toolbar>
    </AppBar>
    <Container className={classes.contentRoot}>
      {props.children}
    </Container>
  </>
}

export default IndexPage
