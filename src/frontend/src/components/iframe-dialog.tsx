import { useLocation } from '@reach/router';
import { useEffect, useRef } from 'react';
import { getMessage, WindowMessages } from '../utils/window-messages';

type Props = {
    url: string,
    onClose?: () => void,
    onPopupFailed?: () => void,
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
            let timerId: any;

            const onMessageReceived = (e: MessageEvent<any>) => {
                if(e.origin !== location.origin)
                    return;

                var message = getMessage(e.data);
                if(!message)
                    return;

                clearInterval(timerId);
                props.onMessageReceived && props.onMessageReceived(message);

                timerId = setInterval(
                    () => {
                        if(!windowRef.current || !windowRef.current.closed)
                            return;
    
                        windowRef.current = null;
    
                        clearInterval(timerId);
                        props.onClose && props.onClose();
                    },
                    100)
            };

            const close = () => {
                clearInterval(timerId);

                windowRef.current?.close();
                windowRef.current = null;
            }

            if(!windowRef.current) {
                windowRef.current = window.open(
                    props.url, 
                    'sponsorkit-window', 
                    optionsToString(props.options));
                if(!windowRef.current) {
                    if(!props.onPopupFailed)
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