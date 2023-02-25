import { extractIssueLinkDetails, getBountyhuntUrlFromIssueLinkDetails } from "@utils/github-url-extraction";
import { useRouter } from "next/router";

export default function RedirectPage() {
    const router = useRouter();
    if(!Array.isArray(router.query.all))
        return null;

    try {
        const url = `https://github.com/${router.query.all.join('/')}`;
        const metadata = extractIssueLinkDetails(url);
        if(!metadata)
            return null;

        const redirectUrl = getBountyhuntUrlFromIssueLinkDetails(metadata);
        window.location.href = redirectUrl;
    } catch(e) {
        console.error(e);
    }

    return null;
}