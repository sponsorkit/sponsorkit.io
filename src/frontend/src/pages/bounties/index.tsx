import Currency from "@components/currency";
import { useApi } from "@hooks/clients";
import { Box, Card, CircularProgress } from "@mui/material";
import { SponsorkitDomainControllersApiBountiesBountyResponse } from "@sponsorkit/client";
import { getBountyhuntUrlFromIssueLinkDetails } from "@utils/github-url-extraction";
import React, { useState } from "react";
import { AppBarTemplate } from "..";
import * as classes from "./index.module.scss";

export default function BountiesPage() {
    const bounties = useApi(
        async client => {
            var response = await client.bountiesGet({});
            return response?.bounties;
        },
        []);

    return <AppBarTemplate logoVariant="bountyhunt">
        <Box className={classes.root}>
            <h1 className={classes.header}>Top bounties</h1>
            {bounties ?
                bounties.map(b => 
                    <Bounty 
                        key={`bounty-${b.gitHub.number}`}
                        bounty={b} />) :
                <CircularProgress />}
        </Box>
    </AppBarTemplate>
}

function Bounty(props: {
    bounty: SponsorkitDomainControllersApiBountiesBountyResponse
}) {
    const onClick = () => {
        window.location.href = getBountyhuntUrlFromIssueLinkDetails({
            owner: props.bounty.gitHub.ownerName,
            repo: props.bounty.gitHub.repositoryName,
            number: props.bounty.gitHub.number
        });
    };

    const [raised, setRaised] = useState(false);

    const toggleRaised = () => setRaised(!raised);

    return <Card 
        className={classes.bounty}
        onMouseOver={toggleRaised} 
        onMouseOut={toggleRaised} 
        onClick={onClick}
        raised={raised}
    >
        <Box className={classes.headerColumn}>
            <Currency 
                amount={props.bounty.amountInHundreds / 100}
                className={classes.currency} />
        </Box>
        <Box className={classes.titleColumn}>
            <Box className={classes.repositoryBox}>
                {props.bounty.gitHub.ownerName}/{props.bounty.gitHub.repositoryName}
            </Box>
            <Box className={classes.titleBox}>
                <span className={classes.issueNumber}>#{props.bounty.gitHub.number}</span>
                <span className={classes.title}>{props.bounty.gitHub.title}</span>
            </Box>
        </Box>
    </Card>
}