import { Box, Button, Card, CardContent, CircularProgress, Tooltip, Typography } from "@material-ui/core";
import { GitHub, SvgIconComponent } from '@material-ui/icons';
import AttachMoneyIcon from '@material-ui/icons/AttachMoney';
import { Timeline, TimelineConnector, TimelineContent, TimelineDot, TimelineItem, TimelineOppositeContent, TimelineSeparator } from '@material-ui/lab';
import { RestEndpointMethodTypes } from '@octokit/rest';
import { orderBy, sum } from 'lodash';
import { useMemo, useState } from 'react';
import { BountyhuntTemplate } from '.';
import { AmountPicker } from '../../components/financial/amount-picker';
import { PaymentMethodModal } from '../../components/financial/stripe/payment-modal';
import { Markdown } from '../../components/markdown';
import { extractIssueLinkDetails, extractReposApiLinkDetails } from '../../utils/github-url-extraction';
import { getUrlParameter } from '@utils/url';
import { createApi, makeOctokitCall } from '../../hooks/clients';
import * as classes from './view.module.scss';
import { useCountUp } from 'use-count-up'
import { SponsorkitDomainControllersApiBountiesGitHubIssueIdBountyResponse, SponsorkitDomainControllersApiBountiesIntentGitHubIssueRequest } from "@sponsorkit/client";
import { useAnimatedCount } from "@hooks/animations";

type OctokitIssueResponse = RestEndpointMethodTypes["issues"]["get"]["response"]["data"];

export default function IssueByIdPage(props: {
    location: Location
}) {
    const issueNumber = getUrlParameter(props.location, "number");
    const owner = getUrlParameter(props.location, "owner");
    const repo = getUrlParameter(props.location, "repo");

    const [issue, setIssue] = useState<OctokitIssueResponse|null|undefined>();
    const [bounties, setBounties] = useState<SponsorkitDomainControllersApiBountiesGitHubIssueIdBountyResponse[]|null|undefined>();

    const onRefreshBounties = async () => {
        if(!issue)
            return;
        
        const response = await createApi().apiBountiesGitHubIssueIdGet(issue.id);
        setBounties(response?.bounties ?? null);
    }

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
            onRefreshBounties();
        },
        [issue?.id]);

    if(issue === undefined || bounties === undefined) {
        return <BountyhuntTemplate>
            <CircularProgress />
        </BountyhuntTemplate>;
    }

    if(issue === null)
        throw new Error("Issue not found.");

    return <BountyhuntTemplate>
        <Issue 
            issue={issue}
            bounties={bounties}
            onBountyCreated={onRefreshBounties} />
    </BountyhuntTemplate>
}

type Event = {
    time: Date,
    title: string,
    description?: React.ReactNode,
    icon: SvgIconComponent
}

function Issue(props: {
    issue: OctokitIssueResponse,
    bounties: SponsorkitDomainControllersApiBountiesGitHubIssueIdBountyResponse[]|null,
    onBountyCreated: () => Promise<void>|void
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
                    <Typography color="textSecondary" gutterBottom className={classes.repoTitle}>
                        {repo.owner}/{repo.name}
                    </Typography>
                    <Typography variant="h3" component="h1" className={classes.issueTitle}>
                        {props.issue.title} <span className={classes.issueNumber}>#{props.issue.number}</span>
                    </Typography>
                    <Markdown 
                        className={classes.markdown} 
                        markdown={props.issue.body} />
                </CardContent>
            </Card>
            <Card className={classes.bountyActivity}>
                <Timeline>
                    {eventsOrdered.map((e, i) => {
                        if(!e)
                            return null;

                        const IconComponent = e.icon;
                        const isLast = i === events.length - 1;
                        return <TimelineItem key={`timeline-${e.time.getTime()}`}>
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
                                <Typography fontWeight="bold" color="primary" className={classes.title}>{e.title}</Typography>
                                {e.description && 
                                    <Typography fontSize="14px" color="textSecondary" className={classes.subtext}>
                                        {e.description}
                                    </Typography>}
                            </TimelineContent>
                        </TimelineItem>;
                    })}
                </Timeline>
            </Card>
        </Box>
        <Bounties 
            issue={props.issue}
            bounties={props.bounties}
            onBountyCreated={props.onBountyCreated} />
    </Box>
}

function Bounties(props: { 
    issue: OctokitIssueResponse,
    bounties: SponsorkitDomainControllersApiBountiesGitHubIssueIdBountyResponse[]|null,
    onBountyCreated: () => Promise<void>|void
}) {    
    const totalBountyReward = useAnimatedCount(
        () => !props.bounties ? 0 : 
            sum(props.bounties.map(x => x.amountInHundreds)) / 100,
        [props.bounties]);

    const totalBountyCount = useAnimatedCount(
        () => props.bounties?.length ?? 0,
        [props.bounties]);

    const claimError = useMemo(
        () => {
            if(totalBountyReward.static === 0)
                return "There is no bounty to claim";

            if(props.issue.state === "closed")
                return "The reward can't be claimed when the issue isn't closed";

            return "";
        },
        [props.issue.state, totalBountyReward]);

    const issueDetails = extractIssueLinkDetails(props.issue.html_url);
    if(!issueDetails)
        throw new Error("Could not fetch issue details.");
    
    return <Card className={classes.bounties}>
        <>
        <CardContent className={classes.bountyAmount}>
            <Box className={classes.labelContainer}>
                <Typography component="div" variant="h3" className={classes.amountRaised}>
                    <Tooltip title={`$${totalBountyReward.static} USD`}><b>${totalBountyReward.animated}</b></Tooltip> reward
                </Typography>
                <Typography component="div" className={classes.amountOfSponsors}>
                    <b>{totalBountyCount.animated}</b> bounties
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
                currentAmount={10}
                issue={{
                    issueNumber: issueDetails.number,
                    ownerName: issueDetails.owner,
                    repositoryName: issueDetails.repo
                }}
                onBountyCreated={props.onBountyCreated} />
        </CardContent>
        </>
    </Card>
}

function CreateBounty(props: {
    issue: SponsorkitDomainControllersApiBountiesIntentGitHubIssueRequest,
    currentAmount: number,
    onBountyCreated: () => Promise<void>|void
}) {
    const [amount, setAmount] = useState(0);
    const [shouldCreate, setShouldCreate] = useState(false);

    const onCreateClicked = () => setShouldCreate(true);

    return <>
        <Typography variant="h4" component="h3" className={classes.title}>
            {props.currentAmount > 0 ?
                "Increase bounty" :
                "Add bounty"}
        </Typography>
        <AmountPicker
            options={[10, 25, 50, 100]}
            onAmountChanged={setAmount} />
        <Button 
            className={classes.addButton}
            variant="contained" 
            onClick={onCreateClicked}
        >
            Add
        </Button>
        {shouldCreate && 
            <PaymentMethodModal 
                onComplete={props.onBountyCreated}
                onClose={() => setShouldCreate(false)} 
                onAcquirePaymentIntent={async () => {
                    const response = await createApi().apiBountiesPaymentIntentPost({
                        body: {
                            amountInHundreds: amount * 100,
                            issue: props.issue
                        }
                    });
                    if(!response)
                        throw new Error("Could not create intent for bounty.");

                    return {
                        clientSecret: response.paymentIntentClientSecret,
                        existingPaymentMethodId: response.existingPaymentMethodId
                    }
                }}
            />}
    </>;
}