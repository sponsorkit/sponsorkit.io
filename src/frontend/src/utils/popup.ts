export function isPopupBlocked(window: Window|null) {
    if(!window)
        return true;

    if(typeof window.closed === "undefined")
        return false;

    return window.closed;
}