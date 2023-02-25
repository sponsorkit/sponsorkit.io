export function tryCreateUrl(url?: string) {
    if(!url)
        return null;

    try {
        return new URL(url);
    } catch {
        return null;
    }
}