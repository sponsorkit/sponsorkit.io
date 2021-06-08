import React, {useMemo, useState} from 'react';
import {Button, TextField} from "@material-ui/core";
import {createApi, useApi, useOctokit} from "../../hooks/clients";
import { RestEndpointMethodTypes } from '@octokit/rest';
import { sum } from 'lodash';
import { AmountPicker } from '../../components/financial/amount-picker';
import { useStripe } from '@stripe/react-stripe-js';

type OctokitIssueResponse = RestEndpointMethodTypes["issues"]["get"]["response"]["data"];

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
                repo: issueDetails.repo,
                request: {
                    signal: abortSignal
                }
            });
            return issueResponse.data;
        },
        [issueDetails]);
    
    return <>
        <TextField 
            value={issueLink}
            onChange={e => setIssueLink(e.target.value)} />
        {issue && <Bounties issue={issue} />}
    </>
}

function CreateBounty(props: {
    gitHubIssueId: number
}) {
    const stripe = useStripe();
    const [amount, setAmount] = useState(0);

    const onCreate = async () => {
        if(!stripe)
            return;

        const intentResponse = await createApi().apiBountiesIntentGet({
            body: {
                gitHubIssueId: props.gitHubIssueId,
                amountInHundreds: amount * 100
            }
        });
        if(!intentResponse.paymentIntentClientSecret)
            throw new Error("No intent secret.");

        const result = await stripe.confirmCardPayment(intentResponse.paymentIntentClientSecret);
        if(result.error)
            throw result.error;

        await createApi().apiBountiesIntentPost({
            body: {
                paymentIntentId: result.paymentIntent.id
            }
        });

        alert("Your bounty has been created!");
    }

    return <>
        <h1>Create bounty</h1>
        <AmountPicker
            options={[10, 25, 50, 100]}
            onAmountChanged={setAmount} />
        <Button onClick={onCreate}>
            Create
        </Button>
    </>;
}

function Bounties(props: { 
    issue: OctokitIssueResponse
}) {
    const bounties = useApi(
        async (client, abortSignal) => {
            const response = await client.apiBountiesGitHubIssueIdGet(
                props.issue.id.toString(), 
                { abortSignal });
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

        <CreateBounty gitHubIssueId={props.issue.id} />
    </>
}