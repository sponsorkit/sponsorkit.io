export type WindowMessage<K, T = null> = {
    origin: "sponsorkit",
    type: K,
    data: T
}

export type WindowMessages = 
    OnWindowCloseMessage |
    OnGitHubCodeMessage;

type OnWindowCloseMessage = WindowMessage<"on-window-close">;
type OnGitHubCodeMessage = WindowMessage<"on-github-code", {
    code: string,
    state: string
}>;

export function getMessage(data: any): WindowMessages|null {
    if(typeof data !== "object")
        return null;

    if(data.origin !== "sponsorkit")
        return null;

    return data;
}

export function createMessage<T extends WindowMessages>(key: T["type"], data: T["data"]) {
    return {
        data,
        origin: "sponsorkit",
        type: key
    } as WindowMessages;
}