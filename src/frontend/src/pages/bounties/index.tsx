import Currency from "@components/currency";
import { Box } from "@mui/material";
import { SponsorkitDomainControllersApiBountiesBountyResponse } from "@sponsorkit/client";
import { getBountyhuntUrlFromIssueLinkDetails } from "@utils/github-url-extraction";
import React from "react";
import { AppBarTemplate } from "..";
import { useApi } from "../../hooks/clients";
import * as classes from "./index.module.scss";

export default function BountiesPage() {
    const bounties = useApi(
        async client => {
            var response = await client.bountiesGet({});
            return response?.bounties;
        },
        []);

    return <AppBarTemplate logoVariant="bountyhunt">
        <h1>Top bounties</h1>
        {bounties?.map(b => <Bounty bounty={b} />)}
    </AppBarTemplate>
}

function Bounty(props: {
    bounty: SponsorkitDomainControllersApiBountiesBountyResponse
}) {
    return <a 
        className={classes.bounty}
        href={getBountyhuntUrlFromIssueLinkDetails({
            owner: props.bounty.gitHub.ownerName,
            repo: props.bounty.gitHub.repositoryName,
            number: props.bounty.gitHub.number
        })}
    >
        <Box className={classes.headerColumn}>
            <Currency 
                amount={props.bounty.amountInHundreds / 100}
                className={classes.currency} />
        </Box>
        <Box>
            <span>#{props.bounty.gitHub.number}</span>
            <span>{props.bounty.gitHub.title}</span>
        </Box>
    </a>
}