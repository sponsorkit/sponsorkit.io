import { useLocation } from '@reach/router';
import { useEffect, useRef } from 'react';
import { getMessage, WindowMessages } from '../utils/window-messages';

type Props = {
    url: string,
    open: boolean,
    onClose?: () => void,
    options?: Partial<Options>,
    onMessageReceived?: (message: WindowMessages) => void,
};

type StringBoolean = 'yes'|'no';

type Options = {
    toolbar: StringBoolean,
    location: StringBoolean,
    status: StringBoolean,
    menubar: StringBoolean,
    scrollbars: StringBoolean,
    resizable: StringBoolean,
    width?: number,
    height?: number
};

export default function IframeDialog(props: Props) {
    const windowRef = useRef<Window|null>();
    const location = useLocation();

    useEffect(
        () => {
            const onMessageReceived = (e: MessageEvent<any>) => {
                if(e.origin !== location.origin)
                    return;

                var message = getMessage(e.data);
                if(!message)
                    return;

                if(message.type === "on-window-close")
                    return onClose();

                props.onMessageReceived && props.onMessageReceived(message);
            };

            const removeEventListeners = () => {
                if(!windowRef.current)
                    return;

                windowRef.current.removeEventListener("message", onMessageReceived);
            }

            const onClose = () => {
                removeEventListeners();
                props.onClose && props.onClose();
            }

            const close = () => {
                if(!windowRef.current)
                    return;
                
                removeEventListeners();
                windowRef.current.close();
            }

            if(props.open) {
                if(!windowRef.current) {
                    windowRef.current = window.open(
                        props.url, 
                        'sponsorkit-window', 
                        optionsToString(props.options));
                    if(!windowRef.current)
                        throw new Error("Could not create window.");

                    windowRef.current.addEventListener("message", onMessageReceived);
                }
            } else {
                close();
            }

            return close;
        },
        [props.open])

    return null;
}

function optionsToString(options: Props["options"]) {
    if(!options)
        return "";

    const defaultOptions: Options = {
        location: 'no',
        menubar: 'no',
        resizable: 'no',
        scrollbars: 'yes',
        status: 'no',
        toolbar: 'no'
    };

    const keys = Object.getOwnPropertyNames(options) as (keyof Options)[];
    
    let result = new Array<string>();
    for(let key of keys) {
        const value = options[key] ?? defaultOptions[key];
        if(!value)
            continue;
        
        result.push(`${key}=${value}`);
    }

    return result.join(',');
}