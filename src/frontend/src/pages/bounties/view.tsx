import {useEffect, useMemo, useState} from 'react';
import {Button, CardContent, Typography, Card, CircularProgress} from "@material-ui/core";

import * as classes from './view.module.scss';
import { extractReposApiLinkDetails } from '../../helpers/github-url-extraction';
import { Markdown } from '../../components/markdown';
import { RestEndpointMethodTypes } from '@octokit/rest';
import { sum } from 'lodash';
import { createApi, createOctokit, useApi, useOctokit } from '../../hooks/clients';
import { AmountPicker } from '../../components/financial/amount-picker';
import { PaymentMethodModal } from '../../components/financial/stripe/payment-method-modal';
import { getUrlParameter } from '../../helpers/url';

type OctokitIssueResponse = RestEndpointMethodTypes["issues"]["get"]["response"]["data"];

export default function IssueByIdPage(props: {
    location: Location
}) {
    const issueNumber = getUrlParameter(props.location, "number");
    const owner = getUrlParameter(props.location, "owner");
    const repo = getUrlParameter(props.location, "repo");

    const [issue, setIssue] = useState<OctokitIssueResponse|null|undefined>();

    useEffect(
        () => {
            async function effect() {
                if(!issueNumber || !owner || !repo)
                    return undefined;
    
                const client = createOctokit();
                const issueResponse = await client.issues.get({
                    issue_number: +issueNumber,
                    owner,
                    repo
                });
                setIssue(issueResponse.data);
            }
            
            effect();
        },
        [issueNumber, owner, repo]);

    if(issue === undefined)
        return <CircularProgress />

    if(issue === null)
        throw new Error("Issue not found.");

    return <>
        <Issue issue={issue} />
    </>
}

function Issue(props: {
    issue: OctokitIssueResponse
}) {
    const repo = extractReposApiLinkDetails(props.issue.repository_url);
    if(!repo)
        throw new Error("Invalid repo details.");

    return <>
        <Card className={classes.issue}>
            <CardContent>
                <Typography color="textSecondary" gutterBottom className={classes.issueTitle}>
                    {repo.owner}/{repo.name}
                </Typography>
                <Typography variant="h3" component="h1">
                    {props.issue.title} <span className={classes.issueNumber}>#{props.issue.number}</span>
                </Typography>
                <Markdown 
                    className={classes.markdown} 
                    markdown={props.issue.body} />
            </CardContent>
        </Card>
        <Bounties issue={props.issue} />
    </>
}

function Bounties(props: { 
    issue: OctokitIssueResponse
}) {
    const bounties = useApi(
        async (client, abortSignal) => {
            const response = await client.apiBountiesGitHubIssueIdGet(
                props.issue.id.toString(), 
                { 
                    abortSignal 
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

        <CreateBounty gitHubIssueId={props.issue.id} />
    </>
}

function CreateBounty(props: {
    gitHubIssueId: number
}) {
    const [amount, setAmount] = useState(0);
    const [shouldCreate, setShouldCreate] = useState(false);

    const onCreateClicked = () => setShouldCreate(true);

    const onPaymentMethodAcquired = async () => {
        const amountInHundreds = amount * 100;
        await createApi().apiBountiesGitHubIssueIdPost(
            props.gitHubIssueId.toString(),
            {
                body: {
                    amountInHundreds,
                    gitHubIssueId: props.gitHubIssueId
                }
            });

        alert("Your bounty has been created!");
    }

    return <>
        <h1>Create bounty</h1>
        <AmountPicker
            options={[10, 25, 50, 100]}
            onAmountChanged={setAmount} />
        <Button onClick={onCreateClicked}>
            Create
        </Button>
        {shouldCreate && 
            <PaymentMethodModal>
                {onPaymentMethodAcquired}
            </PaymentMethodModal>}
    </>;
}