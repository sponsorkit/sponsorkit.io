import BankDetailsDialog from "@components/account/bank-details-dialog";
import EmailValidationDialog from "@components/account/email-validation-dialog";
import Currency from "@components/currency";
import { AmountPicker } from "@components/financial/amount-picker";
import { PaymentMethodModal } from "@components/financial/stripe/payment-modal";
import LoginDialog from "@components/login/login-dialog";
import { Markdown } from "@components/markdown";
import ProgressList from "@components/progress/progress-list";
import TooltipLink from "@components/tooltip-link";
import getDialogTransitionProps from "@components/transitions/dialog-transition";
import { Transition } from "@components/transitions/transition";
import { createApi, makeOctokitCall, useApi } from "@hooks/clients";
import { useAnimatedCount } from "@hooks/count-up";
import { useToken } from "@hooks/token";
import { GitHub, SvgIconComponent } from '@mui/icons-material';
import AttachMoneyIcon from '@mui/icons-material/AttachMoney';
import { Timeline, TimelineConnector, TimelineContent, TimelineDot, TimelineItem, TimelineOppositeContent, TimelineSeparator } from '@mui/lab';
import { Autocomplete, Box, Button, Card, CardContent, Checkbox, Dialog, DialogActions, DialogContent, FormControlLabel, FormGroup, TextField, Tooltip, Typography } from "@mui/material";
import { RestEndpointMethodTypes } from '@octokit/rest';
import { AppBarTemplate } from "@pages/index";
import { SponsorkitDomainControllersApiBountiesGitHubIssueIdBountyResponse, SponsorkitDomainControllersApiBountiesIntentGitHubIssueRequest } from "@sponsorkit/client";
import { extractIssueLinkDetails, extractReposApiLinkDetails } from "@utils/github-url-extraction";
import { newGuid } from "@utils/guid";
import { combineClassNames } from "@utils/strings";
import { getUrlParameter } from "@utils/url";
import { orderBy, sum } from 'lodash';
import { forwardRef, useEffect, useMemo, useState } from 'react';
import uri from "uri-tag";
import * as classes from './index.module.scss';

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

                    if (issue) {
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

const Issue = forwardRef(function (
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
    const eventsOrdered = orderBy(events, x => x?.time.getTime(), "desc");

    const repo = extractReposApiLinkDetails(props.issue.url);
    if (!repo)
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

    const [token] = useToken();

    const claimError = useMemo(
        () => {
            if (totalBountyReward.current === 0)
                return "There is no bounty to claim";

            if (props.issue.state === "closed")
                return "The reward can't be claimed when the issue isn't closed";

            if(props.bounties?.find(x => x.claimRequests.find(c => c.creatorId === token?.userId)))
                return "You have already sent a claim request for this reward.";

            return "";
        },
        [props.issue.state, totalBountyReward]);

    const issueDetails = extractIssueLinkDetails(props.issue.url);
    if(!issueDetails)
        throw new Error("No issue details could be extracted.");

    const [isClaiming, setIsClaiming] = useState(false);

    const onClaimClicked = async () => {
        if (!!claimError)
            return;

        setIsClaiming(true);
    }

    return <Card className={classes.bounties}>
        <>
            <ClaimDialog
                issue={props.issue}
                isOpen={isClaiming}
                onClose={() => setIsClaiming(false)} />
            <CardContent className={classes.bountyAmount}>
                <Box className={classes.labelContainer}>
                    <Typography component="div" variant="h3" className={classes.amountRaised}>
                        <Currency amount={totalBountyReward.animated} /> reward
                    </Typography>
                    <Typography component="div" className={classes.amountOfSponsors}>
                        <b>{totalBountyCount.animated}</b> bount{totalBountyCount.current === 1 ? "y" : "ies"}
                    </Typography>
                </Box>
                <Tooltip title={claimError} className={classes.buttonContainer}>
                    <Button
                        className={`${classes.claimButton} ${!!claimError ? classes.disabled : ""}`}
                        disableRipple={!!claimError}
                        variant="outlined"
                        onClick={onClaimClicked}
                    >
                        Claim
                    </Button>
                </Tooltip>
            </CardContent>
            <CardContent>
                <CreateBounty
                    currentAmount={totalBountyReward.current}
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
    
    const [consentChargedAferIssueClose, setConsentChargedAferIssueClose] = useState(false);
    const [consentNoRefunds, setConsentNoRefunds] = useState(false);

    const hasConsent = useMemo(
        () => consentChargedAferIssueClose && consentNoRefunds,
        [consentChargedAferIssueClose, consentNoRefunds]);

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
        <PaymentMethodModal
            isOpen={shouldCreate}
            isDisabled={!hasConsent}
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
            afterChildren={<FormGroup className={classes.consent}>
                <FormControlLabel 
                    className={classes.label}
                    label={<>I agree to be charged <Currency amount={amount} /> whenever my bounty is awarded to someone.</>}
                    control={<Checkbox
                        checked={consentChargedAferIssueClose}
                        onChange={() => setConsentChargedAferIssueClose(!consentChargedAferIssueClose)}
                        className={classes.consentCheckbox} />} />
                <FormControlLabel 
                    className={classes.label}
                    label={<>
                        I agree that my bounty will be relocated to another issue if it isn't awarded. <TooltipLink text="Why?">
                            <Typography>
                                If people know that their bounty can't be refunded, they are more likely to actually award the bounty to the bountyhunters after the issue has been closed. This decreases the chance of bountyhunters finishing their work, only to realize that the bounty isn't going to be awarded to them.
                            </Typography>
                            <Typography>
                                In the event that no one claims the bounty, the bounty is relocated to another issue in the open source community, among the most upvoted issues across all of GitHub.
                            </Typography>
                            <Typography>
                                Bountyhunt's only earnings are the fees.
                            </Typography>
                        </TooltipLink>
                    </>}
                    control={<Checkbox
                        checked={consentNoRefunds}
                        onChange={() => setConsentNoRefunds(!consentNoRefunds)}
                        className={classes.consentCheckbox} />} />
            </FormGroup>}
        />
    </>;
}

type ClaimDialogProps = {
    issue: OctokitIssueResponse,
    isOpen: boolean,
    onClose: () => void
};

function ClaimDialog(props: ClaimDialogProps) {
    const [key] = useState(newGuid);

    return <LoginDialog
        key={key}
        isOpen={props.isOpen}
        onDismissed={props.onClose}
    >
        {() => <Dialog
            open={props.isOpen}
            onClose={props.onClose}
            {...getDialogTransitionProps()}
        >
            <ClaimDialogContents {...props} />
        </Dialog>}
    </LoginDialog>
}

function ClaimDialogContents(props: ClaimDialogProps) {
    console.log("render", "claim-dialog-contents");

    const issueDetails = extractIssueLinkDetails(props.issue.url);
    const [isValidatingEmail, setIsValidatingEmail] = useState(false);
    const [isFillingInBankDetails, setIsFillingInBankDetails] = useState(false);
    const [isClaiming, setIsClaiming] = useState(false);
    const [lastProgressChange, setLastProgressChange] = useState(new Date());

    const [isValidated, setIsValidated] = useState(false);

    const [token] = useToken();
    const account = useApi(
        async (client, abortSignal) => token ?
            await client.accountGet({
                abortSignal
            }) :
            null,
        [lastProgressChange, token]);    

    const pullRequests = useApi(
        async (client, abortSignal) => {
            if(!issueDetails || !account?.gitHubUsername)
                return undefined;
                
            var response = await client.githubRepositoriesRepositoryOwnerRepositoryNamePullRequestsFromUserGet(
                issueDetails.owner,
                issueDetails.repo,
                {
                    abortSignal
                });
            return orderBy(response.pullRequests, x => x.mergedAt);
        },
        [account]); 
    useEffect(() => console.log("pull-requests", pullRequests), [pullRequests]);

    const [selectedPullRequest, setSelectedPullRequest] = useState<ArrayContents<typeof pullRequests> | null>();
    const pullRequestError = useMemo(
        () => {
            if (selectedPullRequest === undefined)
                return "";

            if (!selectedPullRequest)
                return "You must select a pull request.";

            if (!selectedPullRequest.mergedAt)
                return "Only merged pull requests are accepted."

            return "";
        },
        [selectedPullRequest]);

    const error = useMemo(
        () => {
            if(!!pullRequestError)
                return pullRequestError;

            return 
        },
        [pullRequestError]);

    const onClaimClicked = async () => {
        if (error || !selectedPullRequest)
            return;

        setIsClaiming(true);
        try {
            await createApi().bountiesClaimPost({
                body: {
                    gitHubPullRequestNumber: selectedPullRequest.number,
                    gitHubIssueId: props.issue.id
                }
            });
            props.onClose();
        } finally {
            setIsClaiming(false);
        }
    }

    const isLoaded = !!account && !!pullRequests;

    if(!issueDetails) 
        throw new Error("Couldn't infer issue details.");

    return <>
        <DialogContent>
            {account && <EmailValidationDialog
                email={account.email}
                isOpen={isValidatingEmail}
                onValidated={() => setLastProgressChange(new Date())}
                onClose={() => setIsValidatingEmail(false)} />}
            <BankDetailsDialog
                isOpen={isFillingInBankDetails}
                onValidated={() => setLastProgressChange(new Date())}
                onClose={() => setIsFillingInBankDetails(false)} />
            <ProgressList
                validationTarget={account}
                title="Claim bounty"
                subTitle="To be able to claim a bounty, you need to fill out all of the following information. This information is needed to reduce the chance of potential fraud."
                onValidated={setIsValidated}
                checkpoints={[
                    {
                        label: "Connect your GitHub account",
                        description: "Connecting your GitHub account allows us to see who you are, and prevent anyone from claiming bounties via pull requests they did not actually create.",
                        validate: account => !!account?.gitHubUsername
                    },
                    {
                        label: "Verify your e-mail address",
                        description: "Verifying your e-mail address reduces the chance of fake accounts, and ensures that you receive important account-related information from us (such as invoices).",
                        validate: account => account?.isEmailVerified || false,
                        onClick: () => setIsValidatingEmail(true)
                    },
                    {
                        label: "Verify payment details",
                        description: "While your card won't be charged when claiming bounties, we store a hash of your card number to prevent fake accounts from being created.",
                        validate: account => !!account?.sponsor?.creditCard,
                    },
                    {
                        label: "Specify payout details",
                        description: "To send you money, you need to complete your Stripe profile, so that we know what bank account to send the money to.",
                        validate: account => !!account?.beneficiary?.isAccountComplete,
                        onClick: () => setIsFillingInBankDetails(true)
                    },
                    {
                        label: "Pick the pull request that solved the issue",
                        description: "We only allow merged pull requests from your GitHub user. Pull requests not from your user, closed pull requests or open pull requests, will not be accepted.",
                        validate: () => !!selectedPullRequest?.mergedAt,
                        children: () => <>
                            <Autocomplete<ArrayContents<typeof pullRequests>>
                                disabled={!isLoaded}
                                options={pullRequests ?? []}
                                autoHighlight
                                getOptionLabel={option => `#${option.number}: ${option.title}`}
                                groupBy={option => option.mergedAt ?
                                    "Valid" :
                                    `Invalid`}
                                renderOption={(props, option) => <Box {...props as any} key={`pullrequest-${option.number}`}>
                                    <Typography className={classes.pullRequest}>
                                        <span className={classes.number}>#{option.number}</span>
                                        <span className={classes.title}>{option.title}</span>
                                    </Typography>
                                </Box>}
                                onChange={(_, value) => setSelectedPullRequest(value || null)}
                                value={selectedPullRequest}
                                renderInput={params => (
                                    <TextField
                                        {...params}
                                        label="Choose a pull request"
                                        variant="outlined"
                                        helperText={pullRequestError}
                                        error={!!pullRequestError}
                                        inputProps={{
                                            ...params.inputProps,
                                            autoComplete: 'new-password', // disable autocomplete and autofill
                                        }}
                                    />
                                )}
                            />
                        </>
                    }
                ]}
            />
        </DialogContent>
        <DialogActions>
            <Button 
                color="secondary"
                onClick={props.onClose}
            >
                Cancel
            </Button>
            <Button 
                variant="contained"
                onClick={onClaimClicked}
                disabled={!isValidated || isClaiming}
            >
                Claim
            </Button>
        </DialogActions>
    </>;
}