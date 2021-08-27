export function getUrlParameter(url: string|Location, key: string): string|undefined {
    if(typeof url === "object")
        return getUrlParameter(url.href, key);

    const uri = tryCreateUrl(url);
    if(!uri)
        return;

    return uri.searchParams.get(key) || undefined;
}

export function tryCreateUrl(url: string) {
    try {
        return new URL(url);
    } catch {
        return null;
    }
}