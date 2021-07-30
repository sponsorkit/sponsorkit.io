import { SponsorkitDomainControllersApiBountiesBountyResponse } from "@sponsorkit/client";
import React from "react";
import { AppBarTemplate } from "..";
import { useApi } from "../../hooks/clients";

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
    return <>
        {props.bounty.amountInHundreds}
        {props.bounty.bountyCount}
        {props.bounty.gitHubIssueId}
    </>;
}