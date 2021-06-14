import { AppBar, Box, Container, Toolbar, Typography } from "@material-ui/core";
import React from "react";
import { SponsorkitDomainApiBountiesBountyResponse } from "../../api/openapi/src";
import { useApi } from "../../hooks/clients";
import BountyhuntBlueIcon from './assets/Bountyhunt-blue.inline.svg';

import * as classes from './index.module.scss';

export default function BountiesPage() {
    const bounties = useApi(
        async client => {
            var response = await client.apiBountiesGet({});
            return response?.bounties;
        },
        []);

    return <BountyhuntTemplate>
        <h1>Top bounties</h1>
        {bounties?.map(b => <Bounty bounty={b} />)}
    </BountyhuntTemplate>
}

export function BountyhuntTemplate(props: {
    children: React.ReactNode
}) {
    return <>
        <AppBar color="default" className={classes.appBar}>
            <Toolbar>
                <BountyhuntLogo />
            </Toolbar>
        </AppBar>
        <Container className={classes.contentRoot}>
            {props.children}
        </Container>
    </>
}

export function BountyhuntLogo() {
    return <Box className={classes.logo}>
        <BountyhuntBlueIcon className={classes.image} />
        <Box className={classes.textContainer}>
            <Typography className={classes.mainText}>bountyhunt.io</Typography>
            <Typography className={classes.secondaryText}>by sponsorkit.io</Typography>
        </Box>
    </Box>
}

function Bounty(props: {
    bounty: SponsorkitDomainApiBountiesBountyResponse
}) {
    return <>
        {props.bounty.amountInHundreds}
        {props.bounty.bountyCount}
        {props.bounty.gitHubIssueId}
    </>;
}