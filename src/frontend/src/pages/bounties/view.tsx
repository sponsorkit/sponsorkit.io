import {useEffect, useMemo, useState} from 'react';
import {Button, CardContent, Typography, Card, CircularProgress, Container} from "@material-ui/core";

import * as classes from './view.module.scss';
import { extractReposApiLinkDetails } from '../../helpers/github-url-extraction';
import { Markdown } from '../../components/markdown';
import { RestEndpointMethodTypes } from '@octokit/rest';
import { sum } from 'lodash';
import { createApi, createOctokit, useApi, useOctokit } from '../../hooks/clients';
import { AmountPicker } from '../../components/financial/amount-picker';
import { PaymentMethodModal } from '../../components/financial/stripe/payment-method-modal';
import { getUrlParameter } from '../../helpers/url';
import AttachMoneyIcon from '@material-ui/icons/AttachMoney';
import GpsNotFixedIcon from '@material-ui/icons/GpsNotFixed';

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

    return <Container className={classes.root}>
        <Issue issue={issue} />
    </Container>
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
    
    return <Card className={classes.createBounty}>
        <>
        <CardContent className={classes.bountyAmount}>
            <Typography component="div" variant="h3" className={classes.amountRaised}>
                <b>${totalAmountInHundreds}</b> reward
            </Typography>
            <Typography component="div" className={classes.amountOfSponsors}>
                <b>{bounties?.length ?? 0}</b> bounties
            </Typography>
        </CardContent>
        <CardContent>
            <CreateBounty 
                currentAmount={totalAmountInHundreds / 100}
                gitHubIssueId={props.issue.id} />
        </CardContent>
        </>
    </Card>
}

function CreateBounty(props: {
    gitHubIssueId: number,
    currentAmount: number
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
        <Typography variant="h4" component="h3" className={classes.title}>
            {props.currentAmount > 0 ?
                "Increase bounty" :
                "Add bounty"}
        </Typography>
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