import uri from "uri-tag";
import { tryCreateUrl } from "./url";

export function extractIssueLinkDetails(issueLink?: string) {
    let owner: string;
    let repo: string;
    let type: string;
    let issueNumberString: string;

    const [firstSegment] = tryGetPathNames(issueLink);
    if(firstSegment === "repos") {
        [, owner, repo, type, issueNumberString] = tryGetPathNames(issueLink);
    } else {
        [owner, repo, type, issueNumberString] = tryGetPathNames(issueLink);
    }

    if(type !== "issues")
        return undefined;
            
    const parsedNumber = parseInt(issueNumberString);
    if(isNaN(parsedNumber))
        return undefined;

    return {
        owner,
        repo,
        type,
        number: parsedNumber
    }
}

export function getBountyhuntUrlFromIssueLinkDetails(details: {
    owner: string,
    repo: string,
    number: number
}) {
    return uri`/bounties/view?owner=${details.owner}&repo=${details.repo}&number=${details.number}`;
}

export function extractReposApiLinkDetails(reposLink?: string) {
    const [type, owner, repo] = tryGetPathNames(reposLink);
    if(type !== "repos")
        return null;

    return {
        owner,
        name: repo
    };
}

function tryGetPathNames(url?: string) {
    const uri = tryCreateUrl(url);
    if(!uri)
        return [];

    if(!uri.pathname)
        return [];
    
    const split = uri.pathname
        .substr(1)
        .split('/');
    return split;
}