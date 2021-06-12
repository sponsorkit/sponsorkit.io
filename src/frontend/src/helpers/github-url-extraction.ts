import { tryCreateUrl } from "./url";

export function extractIssueLinkDetails(issueLink: string) {
    const [owner, repo, type, issueNumberString] = tryGetPathNames(issueLink);
    if(type !== "issues")
        return null;
            
    const parsedNumber = parseInt(issueNumberString);
    if(isNaN(parsedNumber))
        return null;

    return {
        owner,
        repo,
        type,
        number: parsedNumber
    }
}

export function extractReposApiLinkDetails(reposLink: string) {
    const [type, owner, repo] = tryGetPathNames(reposLink);
    if(type !== "repos")
        return null;

    return {
        owner,
        name: repo
    };
}

function tryGetPathNames(url: string) {
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