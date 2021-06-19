import React, { useMemo } from 'react';
import { createApi } from '../../hooks/clients';
import { useToken } from '../../hooks/token';
import { newGuid } from '../../utils/guid';
import IframeDialog from '../iframe-dialog';

export default function LoginDialog(props: {
    children: () => JSX.Element
}) {
    const state = useMemo(newGuid, []);
    const [token, setToken] = useToken();

    if(token && !token.isExpired) {
        return props.children();
    }

    const url = new URL("https://github.com/login/oauth/authorize");
    url.searchParams.set("client_id", "72e8a446cc32814bd9c2");
    url.searchParams.set("scope", "user:email");
    url.searchParams.set("state", state);
    url.searchParams.set("redirect_uri", getRedirectUri().toString());
    
    return <IframeDialog 
        open={true} 
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
        }}
        options={{
            width: 500,
            height: 700
        }} />
}

function getRedirectUri() {
    if(typeof window === "undefined")
        return;

    const redirectUri = new URL(window.location.href);
    redirectUri.pathname = "/login";
    return redirectUri;
}
