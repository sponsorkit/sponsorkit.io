import React, { useEffect, useMemo } from 'react';
import IframeDialog from '../iframe-dialog';
import { useLocation } from '@reach/router';
import { newGuid } from '../../utils/guid';
import { useToken } from '../../hooks/token';
import { createApi } from '../../hooks/clients';

export default function LoginDialog(props: {
    open: boolean,
    redirectUrl?: string,
    onLoggedIn?: () => Promise<void>|void
}) {
    const location = useLocation();
    const state = useMemo(newGuid, []);
    const [_, setToken] = useToken();

    if(location.search) {
        const searchParams = new URLSearchParams(location.search);
        const code = searchParams.get("code");
        const stateFromRedirect = searchParams.get("state");
        if(code) {
            useEffect(() => {
                window.postMessage(
                    {
                        type: "sponsorkit",
                        code,
                        state: stateFromRedirect
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
    url.searchParams.set("state", state);
    url.searchParams.set("redirect_uri", props.redirectUrl ?? location.href);
    
    return <IframeDialog 
        open={props.open} 
        url={url.toString()}
        onMessageReceived={async e => {
            if(typeof e !== "object")
                return;

            if(e.type !== "sponsorkit")
                return;

            if(e.state !== state)
                return;
            
            const code = e.code;
            const response = await createApi().apiSignupFromGithubPost({
                body: {
                  gitHubAuthenticationCode: code
                }
              });
            setToken(response.token ?? "");

            props.onLoggedIn && await Promise.resolve(props.onLoggedIn());
        }}
        options={{
            width: 500,
            height: 700
        }} />
}