import BankDetailsDialog from "@components/account/bank-details-dialog";
import EmailValidationDialog from "@components/account/email-validation-dialog";
import Currency from "@components/currency";
import { AmountPicker } from "@components/financial/amount-picker";
import { FeeDisplay } from "@components/financial/fee-display";
import { PaymentMethodModal } from "@components/financial/stripe/payment-modal";
import LoginDialog from "@components/login/login-dialog";
import { Markdown } from "@components/markdown";
import ProgressList from "@components/progress/progress-list";
import FeesTooltip from "@components/tooltips/fees-tooltip-contents";
import TooltipLink from "@components/tooltips/tooltip-link";
import getDialogTransitionProps from "@components/transitions/dialog-transition";
import { Transition } from "@components/transitions/transition";
import { createApi, makeOctokitCall, useApi } from "@hooks/clients";
import { useConfiguration } from "@hooks/configuration";
import { useAnimatedCount } from "@hooks/count-up";
import { useToken } from "@hooks/token";
import { GitHub, SvgIconComponent } from '@mui/icons-material';
import AttachMoneyIcon from '@mui/icons-material/AttachMoney';
import { Timeline, TimelineConnector, TimelineContent, TimelineDot, TimelineItem, TimelineOppositeContent, TimelineSeparator } from '@mui/lab';
import { Autocomplete, Box, Button, Card, CardContent, Checkbox, CircularProgress, Dialog, DialogActions, DialogContent, FormControlLabel, FormGroup, TextField, Tooltip, Typography } from "@mui/material";
import { AppBarLayout } from "@pages/index";
import { ConfigurationGetResponse, OctokitReposRepositoryOwnerRepositoryNameIssuesIssueNumberGetResponse, SponsorkitDomainControllersApiBountiesGitHubIssueIdBountyResponse, SponsorkitDomainControllersApiBountiesSetupIntentGitHubIssueRequest } from "@sponsorkit/client";
import { extractIssueLinkDetails, extractReposApiLinkDetails, getBountyhuntUrlFromIssueLinkDetails } from "@utils/github-url-extraction";
import { newGuid } from "@utils/guid";
import { combineClassNames } from "@utils/strings";
import { orderBy, sum } from 'lodash';
import { useRouter } from "next/router";
import { forwardRef, useEffect, useMemo, useState } from 'react';
import { ArrayContents } from "src/@types/sponsorkit";
import uri from "uri-tag";
import classes from './index.module.scss';

export default function IssueByIdPage() {
    const [issue, setIssue] = useState<OctokitReposRepositoryOwnerRepositoryNameIssuesIssueNumberGetResponse | null>();
    const [bounties, setBounties] = useState<SponsorkitDomainControllersApiBountiesGitHubIssueIdBountyResponse[] | null>();
    const configuration = useConfiguration();
    const router = useRouter();

    const loadBountiesFromIssue = async (forIssue: OctokitReposRepositoryOwnerRepositoryNameIssuesIssueNumberGetResponse) => {
        setBounties(null);

        const response = await createApi().bountiesGitHubIssueIdGet(forIssue.id);
        setBounties(response?.bounties || null);
    }

    useEffect(
        () => {
            if(!issue)
                return;
            
            loadBountiesFromIssue(issue);
        },
        [issue]);

    return <AppBarLayout logoVariant="bountyhunt" className={classes.root}>
        <IssueInputField
            onChange={async e => {
                console.debug("issue-input-field-changed", e);

                setIssue(e.issue);
                router.push(
                    getBountyhuntUrlFromIssueLinkDetails(e.details),
                    undefined,
                    { shallow: true });
            }} />
        {<Transition transitionKey={`transition-${issue?.number}-${configuration && "config-loaded"}`}>
            {ref => configuration && issue && 
                <Issue
                    ref={ref}
                    issue={issue}
                    bounties={bounties}
                    configuration={configuration}
                    onBountyCreated={async () =>
                        await loadBountiesFromIssue(issue)} />}
        </Transition>}
    </AppBarLayout>
}

type Event = {
    time: Date,
    title: string,
    description?: React.ReactNode,
    icon: SvgIconComponent
}

function IssueInputField(props: {
    onChange: (e: {
        issue: OctokitReposRepositoryOwnerRepositoryNameIssuesIssueNumberGetResponse,
        details: {
            number: number,
            owner: string,
            repo: string
        }
    }) => Promise<any>
}) {
    const router = useRouter();

    const issueNumber = router.query.number as string;
    const owner = router.query.owner as string;
    const repo = router.query.repo as string;

    const areAllIssueVariablesSet = useMemo(
        () => issueNumber && owner && repo, 
        [issueNumber, owner, repo]);
    useEffect(
        () => {
            if(!areAllIssueVariablesSet)
                return;
            
            setIssueLink(`https://github.com/${owner}/${repo}/issues/${issueNumber}`);
        },
        [areAllIssueVariablesSet]);

    const getErrorMessage = () => {
        if (isLoading || issueLink === undefined)
            return null;

        if (issueLink && !issueDetails)
            return "The URL doesn't seem to be valid.";

        if (issue === null)
            return "No issue was found with the given URL.";
    };

    const [issue, setIssue] = useState<OctokitReposRepositoryOwnerRepositoryNameIssuesIssueNumberGetResponse | null>();

    const [issueLink, setIssueLink] = useState<string>();
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
                    const issue = 
                        issueResponse?.data as any as OctokitReposRepositoryOwnerRepositoryNameIssuesIssueNumberGetResponse || 
                        null;
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

    return <Card className={classes["issue-link-input"]}>
        <CardContent className={classes["card-content"]}>
            <Box className={classes["text-field-container"]}>
                <TextField
                    className={classes["text-field"]}
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
                    onChange={e => {
                        console.info("change", e.target.value);
                        setIssueLink(e.target.value);
                    }} />
                <CircularProgress className={combineClassNames(
                    classes.spinner,
                    isLoading && classes.active)} />
            </Box>
        </CardContent>
    </Card>
}

const Issue = forwardRef(function (
    props: {
        configuration: ConfigurationGetResponse,
        issue: OctokitReposRepositoryOwnerRepositoryNameIssuesIssueNumberGetResponse,
        bounties: SponsorkitDomainControllersApiBountiesGitHubIssueIdBountyResponse[] | null | undefined,
        onBountyCreated: () => Promise<void> | void
    },
    ref: React.Ref<HTMLDivElement>
) {
    const events: Array<Event | null> = [
        {
            time: new Date(props.issue.createdAt),
            title: "Issue created",
            description: <>By <b>{props.issue.user?.login}</b></>,
            icon: GitHub
        },
        props.issue.updatedAt && props.issue.updatedAt !== props.issue.createdAt ?
            {
                time: new Date(props.issue.updatedAt),
                title: "Issue updated",
                description: null,
                icon: GitHub
            } :
            null,
        props.issue.closedAt ?
            {
                time: new Date(props.issue.closedAt),
                title: "Issue closed",
                description: <>By <b>{props.issue.closedBy?.login}</b></>,
                icon: GitHub
            } :
            null,
        ...(props.bounties?.map(b => ({
            time: new Date(b.createdAtUtc),
            title: "Bounty added",
            description: <><b>${b.amountInHundreds / 100}</b> by <b>{b.creatorUser.gitHubUsername}</b></>,
            icon: AttachMoneyIcon
        })) ?? [])
    ].filter(x => !!x);
    
    const eventsOrdered = orderBy(events, x => x?.time?.getTime(), "desc");

    const repo = extractReposApiLinkDetails(props.issue.url);
    if (!repo)
        throw new Error("Expected repo details.");

    return <Box
        className={combineClassNames(classes["issue-root"])}
        ref={ref}
    >
        <Box className={classes["issue-box"]}>
            <Card className={classes.issue}>
                <CardContent>
                    <Typography color="textSecondary" gutterBottom className={classes["repo-title"]}>
                        {repo.owner}/{repo.name}
                    </Typography>
                    <Typography variant="h3" component="h1" className={classes["issue-title"]}>
                        <a href={uri`https://github.com/${repo.owner}/${repo.name}/issues/${props.issue.number}`} target="_blank">
                            {props.issue.title} <span className={classes["issue-number"]}>#{props.issue.number}</span>
                        </a>
                    </Typography>
                    <Markdown
                        className={classes.markdown}
                        markdown={props.issue.body} />
                </CardContent>
            </Card>
            <Card className={classes["bounty-activity"]}>
                <Timeline>
                    {eventsOrdered.map((e, i) => {
                        if (!e)
                            return null;

                        const IconComponent = e.icon;
                        const isLast = i === events.length - 1;
                        return <TimelineItem key={`timeline-${e.time.getTime()}-${e.title}`}>
                            <TimelineOppositeContent>
                                <Typography variant="body2" color="textSecondary" className={classes["date-mark"]}>
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
                            <TimelineContent className={classes["timeline-content"]}>
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
            configuration={props.configuration}
            issue={props.issue}
            bounties={props.bounties}
            onBountyCreated={props.onBountyCreated} />
    </Box>
});

function Bounties(props: {
    configuration: ConfigurationGetResponse,
    issue: OctokitReposRepositoryOwnerRepositoryNameIssuesIssueNumberGetResponse,
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
                return "There is no bounty to claim.";

            if (!props.issue.closedAt)
                return "The reward can't be claimed when the issue isn't closed.";

            if(props.bounties?.find(x => x.claimRequests.find(c => c.creatorId === token?.userId)))
                return "You have already sent a claim request for this reward.";

            return "";
        },
        [props.issue, totalBountyReward, props.bounties]);

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
                configuration={props.configuration}
                issue={props.issue}
                isOpen={isClaiming}
                onClose={() => setIsClaiming(false)} />
            <CardContent className={classes["bounty-amount"]}>
                <Box className={classes["label-container"]}>
                    <Typography component="div" variant="h3" className={classes["amount-raised"]}>
                        <Currency amount={totalBountyReward.animated} /> reward
                    </Typography>
                    <Typography component="div" className={classes["amount-of-sponsors"]}>
                        <b>{totalBountyCount.animated}</b> bount{totalBountyCount.current === 1 ? "y" : "ies"}
                    </Typography>
                </Box>
                <Tooltip title={claimError} className={classes["button-container"]}>
                    <Button
                        className={combineClassNames(
                            classes["claim-button"],
                            !!claimError && classes.disabled)}
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
                    configuration={props.configuration}
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
    configuration: ConfigurationGetResponse,
    issue?: SponsorkitDomainControllersApiBountiesSetupIntentGitHubIssueRequest | null,
    currentAmount: number,
    onBountyCreated: () => Promise<void> | void
}) {
    const [amount, setAmount] = useState<number|null>(10);
    const [shouldCreate, setShouldCreate] = useState(false);
    
    const [consentChargedAferIssueClose, setConsentChargedAferIssueClose] = useState(false);

    const hasConsent = useMemo(
        () => consentChargedAferIssueClose,
        [consentChargedAferIssueClose]);

    const feeAmount = useApi(
        async (client, abortSignal) => {
            if(!amount)
                return null;

            const response = await client.bountiesCalculateGet({
                amountInHundreds: amount * 100,
                abortSignal
            });
            return Math.floor(response.feeAmountInHundreds / 100);
        },
        [amount]);

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
        {amount && <FeeDisplay 
            amount={amount}
            fee={feeAmount}
        />}
        <Button
            disabled={
                !props.issue ||
                !amount ||
                !feeAmount}
            className={classes["add-button"]}
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
            configuration={props.configuration}
            isDoneAccessor={async intent => {
                const bountyIntentResponse = await createApi().bountiesSetupIntentIdGet(intent.id);
                return bountyIntentResponse.isProcessed;
            }}
            onAcquirePaymentIntent={async () => {
                if (!props.issue)
                    throw new Error("Issue was not set.");

                const response = await createApi().bountiesSetupIntentPost({
                    body: {
                        amountInHundreds: (amount || 0) * 100,
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
            afterChildren={<>
                <FormGroup className={classes.consent}>
                    <FormControlLabel 
                        className={classes.label}
                        label={<>I agree to be charged <Currency amount={(amount || 0) + (feeAmount || 0)} /> (including <TooltipLink text="fees"><FeesTooltip /></TooltipLink>) whenever my bounty is claimed.</>}
                        control={<Checkbox
                            checked={consentChargedAferIssueClose}
                            onChange={() => setConsentChargedAferIssueClose(!consentChargedAferIssueClose)}
                            className={classes["consent-checkbox"]} />} />
                </FormGroup>
            </>}
        />
    </>;
}

type ClaimDialogProps = {
    issue: OctokitReposRepositoryOwnerRepositoryNameIssuesIssueNumberGetResponse,
    configuration: ConfigurationGetResponse,
    isOpen: boolean,
    onClose: () => void
};

function ClaimDialog(props: ClaimDialogProps) {
    const [key] = useState(newGuid);

    return <LoginDialog
        key={key}
        isOpen={props.isOpen}
        onDismissed={props.onClose}
        configuration={props.configuration}
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
    const [isFillingInPaymentDetails, setIsFillingInPaymentDetails] = useState(false);

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
            await createApi().bountiesClaimsPost({
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
            <PaymentMethodModal
                isOpen={isFillingInPaymentDetails}
                onComplete={() => setLastProgressChange(new Date())}
                onClose={() => setIsFillingInPaymentDetails(false)}
                configuration={props.configuration}
                onAcquirePaymentIntent={async () => {
                    const response = await createApi().accountPaymentMethodIntentPost();
                    if (!response)
                        throw new Error("Could not create intent for payment method update.");
    
                    return {
                        clientSecret: response.paymentIntentClientSecret,
                        existingPaymentMethodId: response.existingPaymentMethodId
                    }
                }}
            />
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
                        onClick: () => setIsFillingInPaymentDetails(true)
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
                                    <Typography className={classes["pull-request"]}>
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