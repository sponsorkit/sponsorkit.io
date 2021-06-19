import { useLocation } from '@reach/router';
import { useEffect, useRef } from 'react';

type Props = {
    url: string,
    open: boolean,
    options?: Partial<Options>,
    onMessageReceived?: (message: any) => void,
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
                console.log('message', e);
                
                if(e.origin !== location.origin)
                    return;

                props.onMessageReceived && props.onMessageReceived(e.data);
            };

            const close = () => {
                if(!windowRef.current)
                    return;
                
                windowRef.current.removeEventListener("message", onMessageReceived);
                windowRef.current.close();
            }

            if(props.open) {
                if(!windowRef.current) {
                    windowRef.current = window.open(
                        props.url, 
                        'sponsorkit-window', 
                        optionsToString(props.options));
                    windowRef.current?.addEventListener("message", onMessageReceived);
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