import { AppBar, Box, Container, Toolbar, Typography } from "@material-ui/core";
import React from "react";
import { SponsorkitDomainControllersApiBountiesBountyResponse } from "@sponsorkit/client";
import { useApi } from "../../hooks/clients";
import { AppBarTemplate } from "..";

export default function BountiesPage() {
    const bounties = useApi(
        async client => {
            var response = await client.apiBountiesGet({});
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
    return <>
        {props.bounty.amountInHundreds}
        {props.bounty.bountyCount}
        {props.bounty.gitHubIssueId}
    </>;
}