import Currency from "@components/currency";
import LoginDialog from "@components/login/login-dialog";
import { useApi, useOctokit } from "@hooks/clients";
import { useConfiguration } from "@hooks/configuration";
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import { Button, ButtonBase, Card, CardContent, CircularProgress, Dialog, DialogActions, DialogTitle, Typography } from "@mui/material";
import { RestEndpointMethodTypes } from "@octokit/rest";
import { AppBarLayout } from "@pages/index";
import { useRouter } from "next/router";
import { useState } from "react";
import classes from "./verdict.module.scss";

export default function ClaimVerdictPage() {
    return <ClaimVerdictPageContents />
}

function ClaimVerdictPageContents() {
    const configuration = useConfiguration();
    const router = useRouter();

    const claimId = router.query.claimId as string;
    if(!claimId)
        return null;

    if(!configuration)
        return <CircularProgress />;
    
    return <AppBarLayout logoVariant="bountyhunt">
        <LoginDialog 
            isOpen 
            configuration={configuration}
            onDismissed={() => {}}
        >
            {() => <ClaimVerdictContents claimId={claimId} />}
        </LoginDialog>
    </AppBarLayout>
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
        [verdict]);

    const [isRejectOpen, setIsRejectOpen] = useState(false);
    const [isApproveOpen, setIsApproveOpen] = useState(false);

    if(!verdict || !pullRequest || !issue)
        return null;

    if(!pullRequest.data.user)
        throw new Error("Could not find user from pull request.");

    const claimee = pullRequest.data.user.login;
    const amount = verdict.bountyAmountInHundreds / 100;

    return <Card className={classes.root}>
        <Dialog 
            open={isRejectOpen}
            onClose={() => setIsRejectOpen(false)}
        >
            <DialogTitle>Reject claim</DialogTitle>
            <DialogActions>
                <Button 
                    variant="text"
                    color="secondary"
                    onClick={() => setIsRejectOpen(false)}
                >
                    Cancel
                </Button>
                <Button 
                    variant="contained"
                    color="primary"
                    onClick={() => setIsRejectOpen(false)}
                >
                    Reject
                </Button>
            </DialogActions>
        </Dialog>
        <Dialog
            open={isApproveOpen}
            onClose={() => setIsApproveOpen(false)}
        >
            <DialogTitle>Award bounty</DialogTitle>
            <DialogActions>
                <Button 
                    variant="text"
                    color="secondary"
                    onClick={() => setIsApproveOpen(false)}
                >
                    Cancel
                </Button>
                <Button 
                    variant="contained"
                    color="primary"
                    onClick={() => setIsApproveOpen(false)}
                >
                    Award
                </Button>
            </DialogActions>
        </Dialog>
        <CardContent>
            <Typography variant="h3">Verify claim</Typography>
            
            <Typography className={classes.text}>
                <b>{claimee}</b> claims to have solved issue <b>#{issue.data.number}</b> which you placed a <Currency amount={amount} /> bounty on.
            </Typography>

            <Typography className={classes.header} variant="h4">
                Issue
            </Typography>
            <Issue issue={issue.data} />

            <Typography className={classes.header} variant="h4">
                Fix
            </Typography>
            <Issue issue={pullRequest.data} />

            <div className={classes["button-container"]}>
                <DetailedButton
                    variant="outlined" 
                    title="Reject claim"
                    subtitle={<>The issue wasn't solved</>} 
                    onClick={() => setIsRejectOpen(true)}
                />
                    
                <DetailedButton 
                    variant="contained"
                    title="Award bounty"
                    subtitle={<>The issue was solved</>} 
                    onClick={() => setIsApproveOpen(true)}
                />
            </div>
        </CardContent>
    </Card>
}

function Issue(props: {
    issue: GitHubIssue|GitHubPullRequest
}) {
    return <ButtonBase className={classes.issue}>
        <div>
            <div className={classes.heading}>
                <span className={classes.number}>#{props.issue.number}</span>
                <span>{props.issue.title}</span>
            </div>
        </div>
        <OpenInNewIcon className={classes["open-in-new-icon"]} />
    </ButtonBase>;
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
        className={classes["detailed-button"]}
    >
        <span className={classes.title}>{props.title}</span>
        <span className={classes.subtitle}>{props.subtitle}</span>
    </Button>
}