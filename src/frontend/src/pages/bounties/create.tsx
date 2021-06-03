import React, {useMemo, useState} from 'react';
import {TextField} from "@material-ui/core";
import {useApi, useOctokit} from "../../hooks/clients";
import { sum } from "lodash";
import {RestEndpointMethodTypes} from "@octokit/plugin-rest-endpoint-methods/dist-types/generated/parameters-and-response-types";

export default function CreateBountyPage() {
    const [issueLink, setIssueLink] = useState("");
    const issueDetails = useMemo(
        () => {
            if(!issueLink)
                return null;
            
            const [owner, repo, type, issueNumberString] = new URL(issueLink).pathname.split('/');
            if(type !== "issues")
                return null;
            
            const parsedNumber = parseInt(issueNumberString);
            if(isNaN(parsedNumber))
                return null;
            
            return {
                owner,
                repo,
                issueNumber: parsedNumber
            };
        },
        [issueLink]);
    const issue = useOctokit(
        async (client, abortSignal) => {
            if(!issueDetails)
                return null;
            
            const issueResponse = await client.issues.get({
                issue_number: issueDetails.issueNumber,
                owner: issueDetails.owner,
                repo: issueDetails.repo
            });
            return issueResponse.data;
        },
        [issueDetails]);
    
    return <>
        <TextField 
            value={issueLink}
            onChange={e => setIssueLink(e.target.value)} />
        {issue && <Issue issue={issue} />}
    </>
}

function Issue(props: { 
    issue: RestEndpointMethodTypes["issues"]["get"]["response"]["data"]
}) {
    const bounties = useApi(
        async (client, abortSignal) => {
            const response = await client.apiBountiesByGithubIssuePost({
                abortSignal,
                body: {
                    issueId: props.issue.id
                }
            });
            return response?.bounties;
        },
        []);
    
    const totalAmountInHundreds = useMemo(
        () => !bounties ? 0 : sum(bounties.map(x => x.amountInHundreds)),
        []);
    
    return <>
        <h1>{totalAmountInHundreds}</h1>
        {bounties?.map(bounty => <div>
            <p>{bounty.amountInHundreds}</p>
            <p>{bounty.creatorUser?.gitHubUsername}</p>
            <p>{bounty.awardedUser?.gitHubUsername}</p>
        </div>)}
    </h1>
}