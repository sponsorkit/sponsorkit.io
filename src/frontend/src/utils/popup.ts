export function isPopupBlocked(window: Window|null) {
    if(!window)
        return true;

    if(typeof window.closed === "undefined")
        return false;

    return window.closed;
}

export function createPopup(url: string) {
    const popup = window.open(url);
    return !isPopupBlocked(popup);
}