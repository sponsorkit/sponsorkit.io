import {useEffect, useMemo, useState} from 'react';
import {CardContent, TextField} from "@material-ui/core";
import {useOctokit} from "../../hooks/clients";
import uri from 'uri-tag';

import { extractIssueLinkDetails } from '../../helpers/github-url-extraction';
import { navigate } from 'gatsby';
import { Container } from '@material-ui/core';

import * as classes from './create.module.scss';
import { Card } from '@material-ui/core';

export default function CreateBountyPage() {
    const [issueLink, setIssueLink] = useState("");
    const issueDetails = useMemo(
        () => extractIssueLinkDetails(issueLink),
        [issueLink]);
    const issue = useOctokit(
        async (client, abortSignal) => {
            if(!issueDetails)
                return null;
            
            const issueResponse = await client.issues.get({
                issue_number: issueDetails.number,
                owner: issueDetails.owner,
                repo: issueDetails.repo,
                request: {
                    signal: abortSignal
                }
            });
            return issueResponse.data;
        },
        [issueDetails]);

    useEffect(
        () => {
            if(!issue || !issueDetails)
                return;

            navigate(uri`/bounties/view?number=${issueDetails.number}&owner=${issueDetails.owner}&repo=${issueDetails.repo}`);
        },
        [issueDetails, issue]);
    
    return <Container className={classes.root}>
        <Card className={classes.card}>
            <CardContent className={classes.cardContent}>
                <TextField 
                    className={classes.textField}
                    label="GitHub issue URL"
                    placeholder="https://github.com/foo/bar/issues/1337"
                    value={issueLink}
                    onChange={e => setIssueLink(e.target.value)} />
            </CardContent>
        </Card>
    </Container>
}