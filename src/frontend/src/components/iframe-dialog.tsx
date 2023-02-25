import { useEffect, useRef } from 'react';
import { getMessage, WindowMessages } from '../utils/window-messages';

type Props = {
    url: string,
    onClose?: () => void,
    onPopupFailed?: () => void,
    options?: Partial<Options>,
    onMessageReceived?: (message: WindowMessages) => void,
};

type StringBoolean = 'yes' | 'no';

type Options = {
    toolbar: StringBoolean,
    location: StringBoolean,
    status: StringBoolean,
    menubar: StringBoolean,
    scrollbars: StringBoolean,
    resizable: StringBoolean,
    width?: number,
    height?: number,
    top?: number,
    left?: number
};

export default function IframeDialog(props: Props) {
    const windowRef = useRef<Window | null>();

    useEffect(
        () => {
            let timerId: any;
            timerId = setInterval(
                () => {
                    console.debug("iframe-dialog-tick", windowRef.current);
                    if (!windowRef.current || !windowRef.current.closed)
                        return;

                    windowRef.current = null;

                    clearInterval(timerId);
                    props.onClose && props.onClose();
                },
                250);

            const onMessageReceived = (e: MessageEvent<any>) => {
                var message = getMessage(e.data);
                if (!message)
                    return;

                clearInterval(timerId);
                props.onMessageReceived && props.onMessageReceived(message);
            };

            const close = () => {
                clearInterval(timerId);

                windowRef.current?.close();
                windowRef.current = null;
            }

            if (!windowRef.current) {
                windowRef.current = window.open(
                    props.url,
                    'sponsorkit-window',
                    optionsToString(props.options));
                if (!windowRef.current) {
                    if (!props.onPopupFailed)
                        throw new Error("Could not create window.");

                    props.onPopupFailed();
                    return;
                }

                windowRef.current.addEventListener("message", onMessageReceived);
            }

            return close;
        },
        [])

    return null;
}

function getCenterScreenOffsets(width?: number, height?: number) {
    const dualScreenLeft = window.screenLeft !== undefined ? 
        window.screenLeft : 
        window.screenX;
    const dualScreenTop = window.screenTop !== undefined ? 
        window.screenTop : 
        window.screenY;

    const screenWidth = window.innerWidth ? 
        window.innerWidth : 
        document.documentElement.clientWidth ? 
            document.documentElement.clientWidth : 
            screen.width;
    const screenHeight = window.innerHeight ? 
        window.innerHeight : 
        document.documentElement.clientHeight ? 
            document.documentElement.clientHeight : 
            screen.height;

    const systemZoom = screenWidth / window.screen.availWidth;
    const left = !width ? undefined : (screenWidth - width) / 2 / systemZoom + dualScreenLeft;
    const top = !height ? undefined : (screenHeight - height) / 2 / systemZoom + dualScreenTop;

    return { left, top };
}

function optionsToString(options: Props["options"]) {
    if (!options)
        return "";

    const defaultOptions: Options = {
        location: 'no',
        menubar: 'no',
        resizable: 'no',
        scrollbars: 'yes',
        status: 'no',
        toolbar: 'no'
    };

    const centerOffsets = getCenterScreenOffsets(options.width, options.height);
    if (centerOffsets.left && !options.left)
        options.left = centerOffsets.left;

    if (centerOffsets.top && !options.top)
        options.top = centerOffsets.top;

    const keys = Object.getOwnPropertyNames(options) as (keyof Options)[];

    let result = new Array<string>();
    for (let key of keys) {
        const value = options[key] ?? defaultOptions[key];
        if (!value)
            continue;

        result.push(`${key}=${value}`);
    }

    return result.join(',');
}