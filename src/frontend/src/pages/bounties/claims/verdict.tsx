import { useApi, useOctokit } from "@hooks/clients";
import { Button, Card, CardContent, Typography } from "@material-ui/core";
import { RestEndpointMethodTypes } from "@octokit/rest";
import { AppBarTemplate } from "@pages/index";
import { getUrlParameter } from "@utils/url";

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
            <Typography>Verify bounty claim</Typography>
            <Typography>
                {claimee} claims to have solved issue #{issue.data.number} which you placed a bounty on.
            </Typography>

            <Typography>
                Reported issue
            </Typography>
            <Issue issue={issue.data} />

            <Typography>
                Fix
            </Typography>
            <PullRequest pullRequest={pullRequest.data} />

            <Typography>
                Your bounty
            </Typography>
            <Bounty amountInHundreds={verdict.bountyAmountInHundreds} />

            <div>
                <Button>
                    <span>Award bounty</span>
                    <span>{claimee} receives ${amount}</span>
                </Button>
                <Button>
                    <span>Reject claim</span>
                    <span>${amount} is redistributed into other important issues</span>
                </Button>
            </div>
        </CardContent>
    </Card>
}

function Issue(props: {
    issue: GitHubIssue
}) {
    return null;
}

function PullRequest(props: {
    pullRequest: GitHubPullRequest
}) {
    return null;
}

function Bounty(props: {
    amountInHundreds: number
}) {
    return null;
}