import { useApi, useOctokit } from "@hooks/clients";
import { Card, CardContent } from "@material-ui/core";
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

function ClaimVerdictContents(props: {
    claimId: string
}) {
    const verdict = useApi(
        async (client, abortSignal) => await client.bountiesClaimsClaimIdVerdictGet(props.claimId, {abortSignal}),
        []);
    const pullRequest = useOctokit(
        async client => verdict && await client.pulls.get({
            owner: verdict.gitHub.ownerName,
            pull_number: verdict.gitHub.pullRequestNumber,
            repo: verdict.gitHub.repositoryName
        }),
        [verdict])

    if(!verdict || !pullRequest)
        return null;

    return <Card>
        <CardContent>
            
        </CardContent>
    </Card>
}