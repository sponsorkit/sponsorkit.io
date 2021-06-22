import { Card, CardContent, Container, TextField, Typography } from "@material-ui/core";
import { navigate } from 'gatsby';
import { useEffect, useMemo, useState } from 'react';
import uri from 'uri-tag';
import { BountyhuntTemplate } from '.';
import { extractIssueLinkDetails } from '../../utils/github-url-extraction';
import { useOctokit } from "../../hooks/clients";
import * as classes from './create.module.scss';



export default function CreateBountyPage() {
    const [issueLink, setIssueLink] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    
    const issueDetails = useMemo(
        () => extractIssueLinkDetails(issueLink),
        [issueLink]);

    const issue = useOctokit(
        async (client, abortSignal) => {
            if(!issueDetails)
                return undefined;
            
            try {
                setIsLoading(true);

                const issueResponse = await client.issues.get({
                    issue_number: issueDetails.number,
                    owner: issueDetails.owner,
                    repo: issueDetails.repo,
                    request: {
                        signal: abortSignal
                    }
                });
                return issueResponse.data;
            } finally {
                setIsLoading(false);
            }
        },
        [issueDetails]);

    const errorMessage = useMemo(
        () => {
            if(isLoading)
                return null;

            if(issueLink && !issueDetails)
                return "The URL doesn't seem to be valid.";

            if(issue === null)
                return "No issue was found with the given URL.";
        },
        [issue, isLoading, issueLink, issueDetails]);

    useEffect(
        () => {
            if(!issue || !issueDetails)
                return;

            navigate(uri`/bounties/view?number=${issueDetails.number}&owner=${issueDetails.owner}&repo=${issueDetails.repo}`);
        },
        [issueDetails, issue]);
    
    return <BountyhuntTemplate>
        <Container className={classes.root}>
            <Card className={classes.card}>
                <CardContent className={classes.cardContent}>
                    <Typography variant="h3" component="h1">
                        Create a new bounty
                    </Typography>
                    <Typography variant="body2" component="p" className={classes.body}>
                        Paste the full URL of the GitHub issue you want to put a bounty on.
                    </Typography>
                    <TextField 
                        className={classes.textField}
                        label="GitHub issue URL"
                        error={!!errorMessage}
                        helperText={errorMessage}
                        autoFocus
                        disabled={isLoading}
                        placeholder="https://github.com/foo/bar/issues/1337"
                        value={issueLink}
                        onChange={e => setIssueLink(e.target.value)} />
                </CardContent>
            </Card>
        </Container>
    </BountyhuntTemplate>
}