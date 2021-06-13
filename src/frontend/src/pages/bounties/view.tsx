import {useMemo, useState} from 'react';
import {Button, CardContent, Typography, Card, CircularProgress, Container, Box, Tooltip} from "@material-ui/core";

import * as classes from './view.module.scss';
import { extractReposApiLinkDetails } from '../../helpers/github-url-extraction';
import { Markdown } from '../../components/markdown';
import { RestEndpointMethodTypes } from '@octokit/rest';
import { orderBy, sum } from 'lodash';
import { createApi, makeApiCall, makeOctokitCall } from '../../hooks/clients';
import { AmountPicker } from '../../components/financial/amount-picker';
import { PaymentMethodModal } from '../../components/financial/stripe/payment-method-modal';
import { getUrlParameter } from '../../helpers/url';
import { TimelineItem, TimelineSeparator, TimelineDot, TimelineConnector, TimelineContent, Timeline, TimelineOppositeContent } from '@material-ui/lab';
import { GitHub, SvgIconComponent } from '@material-ui/icons';
import AttachMoneyIcon from '@material-ui/icons/AttachMoney';
import { SponsorkitDomainApiBountiesGitHubIssueIdBountyResponse } from '../../api/openapi/src';

type OctokitIssueResponse = RestEndpointMethodTypes["issues"]["get"]["response"]["data"];

export default function IssueByIdPage(props: {
    location: Location
}) {
    const issueNumber = getUrlParameter(props.location, "number");
    const owner = getUrlParameter(props.location, "owner");
    const repo = getUrlParameter(props.location, "repo");

    const [issue, setIssue] = useState<OctokitIssueResponse|null|undefined>();
    const [bounties, setBounties] = useState<SponsorkitDomainApiBountiesGitHubIssueIdBountyResponse[]|null|undefined>();

    useMemo(
        () => {
            async function effect() {
                if(!issueNumber || !owner || !repo)
                    return;
    
                const issueResponse = await makeOctokitCall(async client => 
                    await client.issues.get({
                        issue_number: +issueNumber,
                        owner,
                        repo
                    }));
                setIssue(issueResponse?.data);
            }
            
            effect();
        },
        [issueNumber, owner, repo]);

    useMemo(
        () => {
            async function effect() {
                if(!issue)
                    return;
                
                const response = await makeApiCall(async client => 
                    await client.apiBountiesGitHubIssueIdGet(issue.id));
                setBounties(response?.bounties ?? null);
            }
            
            effect();
        },
        [issue?.id]);

    if(issue === undefined || bounties === undefined)
        return <CircularProgress />;

    if(issue === null)
        throw new Error("Issue not found.");

    return <Container className={classes.root}>
        <Issue 
            issue={issue}
            bounties={bounties} />
    </Container>
}

type Event = {
    time: Date,
    title: string,
    description?: React.ReactNode,
    icon: SvgIconComponent
}

function Issue(props: {
    issue: OctokitIssueResponse,
    bounties: SponsorkitDomainApiBountiesGitHubIssueIdBountyResponse[]|null
}) {
    const events: Array<Event|null> = 
        [
            {
                time: new Date(props.issue.created_at),
                title: "Issue created",
                description: <>By <b>{props.issue.user?.login}</b></>,
                icon: GitHub
            },
            props.issue.updated_at && props.issue.updated_at !== props.issue.created_at ? 
                {
                    time: new Date(props.issue.updated_at),
                    title: "Issue updated",
                    description: null,
                    icon: GitHub
                } :
                null,
            props.issue.closed_at ? 
                {
                    time: new Date(props.issue.closed_at),
                    title: "Issue closed",
                    description: <>By <b>{props.issue.closed_by?.login}</b></>,
                    icon: GitHub
                } :
                null,
            ...(props.bounties?.map(b => ({
                time: b.createdAtUtc,
                title: "Bounty added",
                description: <><b>${b.amountInHundreds / 100}</b> by <b>{b.creatorUser.gitHubUsername}</b></>,
                icon: AttachMoneyIcon
            })) ?? [])
        ]
        .filter(x => !!x);
    const eventsOrdered = orderBy(events, x => x?.time, "desc");

    const repo = extractReposApiLinkDetails(props.issue.repository_url);
    if(!repo)
        throw new Error("Invalid repo details.");

    return <Box className={classes.rootWrapper}>
        <Box className={classes.issueBox}>
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
            <Card className={classes.bountyActivity}>
                <CardContent>
                    <Timeline>
                        {eventsOrdered.map((e, i) => {
                            if(!e)
                                return null;

                            const IconComponent = e.icon;
                            const isLast = i === events.length - 1;
                            return <TimelineItem>
                                <TimelineOppositeContent>
                                    <Typography variant="body2" color="textSecondary" className={classes.dateMark}>
                                        <span className={classes.date}>{e.time.toLocaleDateString()}</span>
                                        <span className={classes.time}>{e.time.toLocaleTimeString()}</span>
                                    </Typography>
                                </TimelineOppositeContent>
                                <TimelineSeparator>
                                    <TimelineDot>
                                        <IconComponent />
                                    </TimelineDot>
                                    {!isLast && <TimelineConnector />}
                                </TimelineSeparator>
                                <TimelineContent className={classes.timelineContent}>
                                    <Typography fontWeight="bold" color="primary">{e.title}</Typography>
                                    {e.description && 
                                        <Typography fontSize="14px" color="textSecondary">
                                            {e.description}
                                        </Typography>}
                                </TimelineContent>
                            </TimelineItem>;
                        })}
                    </Timeline>
                </CardContent>
            </Card>
        </Box>
        <Bounties 
            issue={props.issue}
            bounties={props.bounties} />
    </Box>
}

function Bounties(props: { 
    issue: OctokitIssueResponse,
    bounties: SponsorkitDomainApiBountiesGitHubIssueIdBountyResponse[]|null
}) {    
    const totalAmount = useMemo(
        () => !props.bounties ? 0 : 
            sum(props.bounties.map(x => x.amountInHundreds)) / 100,
        []);

    const claimError = useMemo(
        () => {
            if(totalAmount === 0)
                return "There is no bounty to claim";

            if(props.issue.state === "closed")
                return "The reward can't be claimed when the issue isn't closed";

            return "";
        },
        [props.issue.state, totalAmount]);
    
    return <Card className={classes.bounties}>
        <>
        <CardContent className={classes.bountyAmount}>
            <Box className={classes.labelContainer}>
                <Typography component="div" variant="h3" className={classes.amountRaised}>
                    <Tooltip title={`$${totalAmount} USD`}><b>${totalAmount}</b></Tooltip> reward
                </Typography>
                <Typography component="div" className={classes.amountOfSponsors}>
                    <b>{props.bounties?.length ?? 0}</b> bounties
                </Typography>
            </Box>
            <Tooltip title={claimError} className={classes.buttonContainer}>
                <Button 
                    className={`${classes.claimButton} ${!!claimError ? classes.disabled : ""}`} 
                    variant="outlined"
                    disableRipple={!!claimError}
                >
                    Claim
                </Button>
            </Tooltip>
        </CardContent>
        <CardContent>
            <CreateBounty 
                currentAmount={totalAmount / 100}
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