import { extractIssueLinkDetails, getBountyhuntUrlFromIssueLinkDetails } from "@utils/github-url-extraction";

export default function RedirectPage(props: {
    location: Location
}) {
    if(!props.location)
        return null;

    const url = new URL(props.location.href);
    url.pathname = url.pathname.replace(/^\/bounties\/redirect\//, '');
    url.host = "github.com";

    const metadata = extractIssueLinkDetails(url.href);
    if(!metadata)
        return null;

    const redirectUrl = getBountyhuntUrlFromIssueLinkDetails(metadata);
    window.location.href = redirectUrl;

    return null;
}