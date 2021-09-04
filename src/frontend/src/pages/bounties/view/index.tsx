import EmailValidationDialog from "@components/account/email-validation-dialog";
import { DialogTransition } from "@components/dialog-transition";
import { AmountPicker } from "@components/financial/amount-picker";
import { PaymentMethodModal } from "@components/financial/stripe/payment-modal";
import { Markdown } from "@components/markdown";
import ProgressList from "@components/progress-list";
import { Transition } from "@components/transition";
import { createApi, makeOctokitCall, useApi, useOctokit } from "@hooks/clients";
import { useAnimatedCount } from "@hooks/count-up";
import { Box, Button, Card, CardContent, Dialog, DialogActions, DialogContent, DialogTitle, TextField, Tooltip, Typography } from "@material-ui/core";
import { GitHub, SvgIconComponent } from '@material-ui/icons';
import AttachMoneyIcon from '@material-ui/icons/AttachMoney';
import { Timeline, TimelineConnector, TimelineContent, TimelineDot, TimelineItem, TimelineOppositeContent, TimelineSeparator } from '@material-ui/lab';
import { RestEndpointMethodTypes } from '@octokit/rest';
import { SponsorkitDomainControllersApiBountiesGitHubIssueIdBountyResponse, SponsorkitDomainControllersApiBountiesIntentGitHubIssueRequest } from "@sponsorkit/client";
import { extractIssueLinkDetails, extractReposApiLinkDetails } from "@utils/github-url-extraction";
import { combineClassNames } from "@utils/strings";
import { getUrlParameter } from "@utils/url";
import { orderBy, sum } from 'lodash';
import { forwardRef, useEffect, useMemo, useState } from 'react';
import { AppBarTemplate } from "src/pages";
import uri from "uri-tag";
import * as classes from './view.module.scss';

type OctokitIssueResponse = RestEndpointMethodTypes["issues"]["get"]["response"]["data"];

export default function IssueByIdPage(props: {
    location: Location
}) {
    const [issue, setIssue] = useState<OctokitIssueResponse | null>();
    const [bounties, setBounties] = useState<SponsorkitDomainControllersApiBountiesGitHubIssueIdBountyResponse[] | null>();

    const loadBountiesFromIssue = async (forIssue: OctokitIssueResponse) => {
        setBounties(null);

        const response = await createApi().bountiesGitHubIssueIdGet(forIssue.id);
        setBounties(response?.bounties || null);
    }

    return <AppBarTemplate logoVariant="bountyhunt" className={classes.root}>
        <IssueInputField
            location={props.location}
            onChange={async e => {
                console.log("issue-input-field-changed", e);
                
                setIssue(e.issue);
                window.history.pushState({}, '', uri`/bounties/view?owner=${e.details.owner}&repo=${e.details.repo}&number=${e.details.number}`);

                await loadBountiesFromIssue(e.issue);
            }} />
        <Transition transitionKey={issue?.number}>
            {ref => issue && <Issue
                ref={ref}
                issue={issue}
                bounties={bounties}
                onBountyCreated={async () => 
                    await loadBountiesFromIssue(issue)} />}
        </Transition>
    </AppBarTemplate>
}

type Event = {
    time: Date,
    title: string,
    description?: React.ReactNode,
    icon: SvgIconComponent
}

function IssueInputField(props: {
    location: Location,
    onChange: (e: {
        issue: OctokitIssueResponse,
        details: {
            number: number,
            owner: string,
            repo: string
        }
    }) => Promise<any>
}) {
    const issueNumber = getUrlParameter(props.location, "number");
    const owner = getUrlParameter(props.location, "owner");
    const repo = getUrlParameter(props.location, "repo");

    const areAllIssueVariablesSet =
        issueNumber &&
        owner &&
        repo;

    const getErrorMessage = () => {
        if (isLoading || issueLink === undefined)
            return null;

        if (issueLink && !issueDetails)
            return "The URL doesn't seem to be valid.";

        if (issue === null)
            return "No issue was found with the given URL.";
    };
        
    const [issue, setIssue] = useState<OctokitIssueResponse | null>();

    const [issueLink, setIssueLink] = useState(areAllIssueVariablesSet ?
        `https://github.com/${owner}/${repo}/issues/${issueNumber}` :
        undefined);
    const [isLoading, setIsLoading] = useState(false);

    const issueDetails = useMemo(
        () => issueLink ?
            extractIssueLinkDetails(issueLink) :
            null,
        [issueLink]);

    useEffect(
        () => {
            async function effect() {
                console.log("load-issue", issueDetails, issue);
                
                if (!issueDetails) {
                    setIssue(null);
                    return;
                }

                try {
                    setIsLoading(true);

                    const issueResponse = await makeOctokitCall(async client =>
                        await client.issues.get({
                            issue_number: issueDetails.number,
                            owner: issueDetails.owner,
                            repo: issueDetails.repo
                        }));
                    const issue = issueResponse?.data || null;
                    setIssue(issue);

                    if(issue) {
                        await props.onChange({
                            issue, 
                            details: issueDetails
                        });
                    }
                } finally {
                    setIsLoading(false);
                }
            }

            effect();
        },
        [issueDetails]);

    const errorMessage = useMemo(
        getErrorMessage,
        [issue, isLoading, issueLink, issueDetails]);

    return <Card className={classes.issueLinkInput}>
        <CardContent className={classes.cardContent}>
            <TextField
                className={classes.textField}
                label="GitHub issue URL"
                error={!!errorMessage}
                helperText={errorMessage}
                autoFocus={!areAllIssueVariablesSet}
                disabled={isLoading}
                InputLabelProps={{
                    shrink: true
                }}
                InputProps={{
                    notched: true
                }}
                placeholder={!issue || !issueLink ?
                    "Paste the full URL of the GitHub issue you want to put a bounty on" :
                    issueLink}
                value={!issue ? 
                    issueLink :
                    ""}
                variant="outlined"
                onChange={e => setIssueLink(e.target.value)} />
        </CardContent>
    </Card>
}

const Issue = forwardRef(function(
    props: {
        issue: OctokitIssueResponse,
        bounties: SponsorkitDomainControllersApiBountiesGitHubIssueIdBountyResponse[] | null | undefined,
        onBountyCreated: () => Promise<void> | void
    },
    ref: React.Ref<HTMLDivElement>
) {
    const events: Array<Event | null> = !props.issue ?
        [] :
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
        throw new Error("Expected repo details.");

    return <Box 
        className={combineClassNames(classes.issueRoot)}
        ref={ref}
    >
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
                        if (!e)
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
});

function Bounties(props: {
    issue: OctokitIssueResponse,
    bounties: SponsorkitDomainControllersApiBountiesGitHubIssueIdBountyResponse[] | null | undefined,
    onBountyCreated: () => Promise<void> | void
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
            if (totalBountyReward.current === 0)
                return "There is no bounty to claim";

            if (props.issue.state === "closed")
                return "The reward can't be claimed when the issue isn't closed";

            return "";
        },
        [props.issue.state, totalBountyReward]);

    const issueDetails = extractIssueLinkDetails(props.issue.html_url);

    const [isClaiming, setIsClaiming] = useState(false);

    const onClaimClicked = async () => {
        if(!!claimError)
            return;

        setIsClaiming(true);
    }

    return <Card className={classes.bounties}>
        <>
            <ClaimDialog issue={props.issue} />
            <CardContent className={classes.bountyAmount}>
                <Box className={classes.labelContainer}>
                    <Typography component="div" variant="h3" className={classes.amountRaised}>
                        <Tooltip title={`$${totalBountyReward.current} USD`}><b>${totalBountyReward.animated}</b></Tooltip> reward
                    </Typography>
                    <Typography component="div" className={classes.amountOfSponsors}>
                        <b>{totalBountyCount.animated}</b> bount{totalBountyCount.current === 1 ? "y" : "ies"}
                    </Typography>
                </Box>
                <Tooltip title={claimError} className={classes.buttonContainer}>
                    <Button
                        className={`${classes.claimButton} ${!!claimError ? classes.disabled : ""}`}
                        variant="outlined"
                        disableRipple={!!claimError}
                        onClick={onClaimClicked}
                    >
                        Claim
                    </Button>
                </Tooltip>
            </CardContent>
            <CardContent>
                <CreateBounty
                    currentAmount={10}
                    issue={issueDetails && {
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
    issue?: SponsorkitDomainControllersApiBountiesIntentGitHubIssueRequest | null,
    currentAmount: number,
    onBountyCreated: () => Promise<void> | void
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
            disabled={!props.issue}
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
                    if (!props.issue)
                        throw new Error("Issue was not set.");

                    const response = await createApi().bountiesPaymentIntentPost({
                        body: {
                            amountInHundreds: amount * 100,
                            issue: props.issue
                        }
                    });
                    if (!response)
                        throw new Error("Could not create intent for bounty.");

                    return {
                        clientSecret: response.paymentIntentClientSecret,
                        existingPaymentMethodId: response.existingPaymentMethodId
                    }
                }}
            />}
    </>;
}

function ClaimDialog(props: {
    issue: OctokitIssueResponse
}) {
    const issueDetails = extractIssueLinkDetails(props.issue.html_url);
    const [isValidatingEmail, setIsValidatingEmail] = useState(false);
    const [lastProgressChange, setLastProgressChange] = useState(new Date());

    const account = useApi(
        async (client, abortSignal) => await client.accountGet({
            abortSignal
        }),
        [lastProgressChange]);
    const pullRequests = useOctokit(
        async client => 
            issueDetails && 
            account?.beneficiary &&
            await client.search.issuesAndPullRequests({
                q: `is:pr is:closed author:${account.beneficiary.gitHubUsername} repo:${issueDetails.repo}`
            }),
        [issueDetails, account]);

    if (!account)
        return null;

    const checkpoints = [
        {
            label: "Connect your GitHub account",
            description: "Connecting your GitHub account allows us to see who you are, and prevent anyone from claiming bounties via pull requests they did not actually create.",
            validate: () => !!account.beneficiary?.gitHubUsername,
            onClick: () => { }
        },
        {
            label: "Verify your e-mail address",
            description: "Verifying your e-mail address reduces the chance of fake accounts, and ensures that you receive important account-related information from us (such as invoices).",
            validate: () => account.isEmailVerified,
            onClick: () => setIsValidatingEmail(true)
        },
        {
            label: "Verify payment details",
            description: "While your card won't be charged when claiming bounties, we store a hash of your card number to prevent fake accounts from being created.",
            validate: () => !!account.sponsor?.creditCard,
            onClick: () => { }
        }
    ];

    return <>
        <EmailValidationDialog
            email={account.email}
            isOpen={isValidatingEmail}
            onValidated={() => setLastProgressChange(new Date())}
            onClose={() => setIsValidatingEmail(false)} />
        <Dialog open TransitionComponent={DialogTransition}>
            <DialogTitle>Claim bounty</DialogTitle>
            <DialogContent>
                <ProgressList
                    title="Trust score"
                    subTitle="To prevent scamming, we only allow you to claim a bounty if you have reached the highest trust score."
                    checkpoints={checkpoints}
                />
            </DialogContent>
            <DialogActions>
                <Button
                    color="secondary"
                >
                    Cancel
                </Button>
                <Button
                    variant="contained"
                >
                    Claim
                </Button>
            </DialogActions>
        </Dialog>
    </>
}