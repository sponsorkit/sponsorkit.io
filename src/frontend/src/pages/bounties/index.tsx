import React from "react";
import { GeneralApiBountiesGetResponse, SponsorkitDomainApiBountiesBountyResponse } from "../../api/openapi/src";
import { useApi } from "../../hooks/clients";

export default function BountiesPage() {
    const bounties = useApi(
        async client => {
            var response = await client.apiBountiesGet({});
            return response?.bounties;
        },
        []);

    return <>
        <h1>Top bounties</h1>
        {bounties?.map(b => <Bounty bounty={b} />)}
    </>
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