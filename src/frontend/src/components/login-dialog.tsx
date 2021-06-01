import React, { useEffect } from 'react';
import IframeDialog from './iframe-dialog';
import { useLocation, useParams } from '@reach/router';

export default function LoginDialog(props: {
    open: boolean,
    redirectUrl?: string,
    onCodeAcquired: (code: string) => void
}) {
    const location = useLocation();

    if(location.search) {
        const searchParams = new URLSearchParams(location.search);
        const code = searchParams.get("code");
        if(code) {
            useEffect(() => {
                window.postMessage(
                    {
                        type: "sponsorkit",
                        code
                    }, 
                    location.origin);
                window.close();
            });
            return null;
        }
    }

    const url = new URL("https://github.com/login/oauth/authorize");
    url.searchParams.set("client_id", "72e8a446cc32814bd9c2");
    url.searchParams.set("scope", "user:email");
    url.searchParams.set("redirect_uri", props.redirectUrl ?? location.href);
    
    return <IframeDialog 
        open={props.open} 
        url={url.toString()}
        onMessageReceived={e => {
            if(typeof e !== "object")
                return;

            if(e.type !== "sponsorkit")
                return;
            
            props.onCodeAcquired(e.code);
        }}
        options={{
            width: 500,
            height: 700
        }} />
}