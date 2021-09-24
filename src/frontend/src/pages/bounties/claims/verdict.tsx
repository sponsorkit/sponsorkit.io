import { useApi, useOctokit } from "@hooks/clients";
import { Button, Card, CardContent, Typography } from "@mui/material";
import { RestEndpointMethodTypes } from "@octokit/rest";
import { AppBarTemplate } from "@pages/index";
import { getUrlParameter } from "@utils/url";
import * as classes from "./verdict.module.scss";

export default function ClaimVerdictPage(props: {
    location: Location
}) {
    const claimId = getUrlParameter(props.location, "claimId");
    if(!claimId)
        return null;
    
    return <AppBarTemplate logoVariant="bountyhunt">
        <ClaimVerdictContents claimId={claimId} />
    </AppBarTemplate>
}

type GitHubPullRequest = RestEndpointMethodTypes["pulls"]["get"]["response"]["data"];
type GitHubIssue = RestEndpointMethodTypes["issues"]["get"]["response"]["data"];

function ClaimVerdictContents(props: {
    claimId: string
}) {
    const verdict = useApi(
        async (client, abortSignal) => await client.bountiesClaimsClaimIdVerdictGet(props.claimId, {abortSignal}),
        []);
    const issue = useOctokit(
        async client => verdict && await client.issues.get({
            owner: verdict.gitHub.ownerName,
            issue_number: verdict.gitHub.issueNumber,
            repo: verdict.gitHub.repositoryName
        }),
        [verdict]);
    const pullRequest = useOctokit(
        async client => verdict && await client.pulls.get({
            owner: verdict.gitHub.ownerName,
            pull_number: verdict.gitHub.pullRequestNumber,
            repo: verdict.gitHub.repositoryName
        }),
        [verdict])

    if(!verdict || !pullRequest || !issue)
        return null;

    if(!pullRequest.data.user)
        throw new Error("Could not find user from pull request.");

    const claimee = pullRequest.data.user.login;
    const amount = verdict.bountyAmountInHundreds / 100;

    return <Card>
        <CardContent>
            <Typography variant="h2">Verify bounty claim</Typography>
            <Typography>
                {claimee} claims to have solved issue #{issue.data.number} which you placed a bounty on.
            </Typography>

            <Typography variant="h3">
                Reported issue
            </Typography>
            <Issue issue={issue.data} />

            <Typography variant="h3">
                Fix
            </Typography>
            <Issue issue={pullRequest.data} />

            <Typography variant="h3">
                Your bounty
            </Typography>
            <Bounty amountInHundreds={verdict.bountyAmountInHundreds} />

            <div className={classes.buttonContainer}>
                <DetailedButton
                    variant="outlined" 
                    title="Reject claim"
                    subtitle={<>${amount} is redistributed into other important issues</>} />
                    
                <DetailedButton 
                    variant="contained"
                    title="Award bounty"
                    subtitle={<>{claimee} receives ${amount}</>} />
            </div>
        </CardContent>
    </Card>
}

function Issue(props: {
    issue: GitHubIssue|GitHubPullRequest
}) {
    return <div className={classes.issue}>
        <div className={classes.heading}>
            <span className={classes.number}>#{props.issue.number}</span>
            <span>{props.issue.title}</span>
        </div>
        <div className={classes.author}>
            By {props.issue.user?.login}
        </div>
    </div>;
}

function DetailedButton(props: {
    onClick?: () => void,
    variant: 'text' | 'outlined' | 'contained',
    title: React.ReactNode,
    subtitle: React.ReactNode
}) {
    return <Button
        variant={props.variant}
        onClick={props.onClick} 
        className={classes.detailedButton}
    >
        <span className={classes.title}>{props.title}</span>
        <span className={classes.subtitle}>{props.subtitle}</span>
    </Button>
}

function Bounty(props: {
    amountInHundreds: number
}) {
    return <div>
        ${props.amountInHundreds / 100}
    </div>;
}