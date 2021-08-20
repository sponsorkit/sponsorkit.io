function isPopupBlocked(window: Window|null) {
    return !window || window.closed || typeof window.closed !== "undefined";
}