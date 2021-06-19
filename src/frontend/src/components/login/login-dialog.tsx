import React, { useMemo } from 'react';
import { getMessage } from 'src/utils/window-messages';
import { createApi } from '../../hooks/clients';
import { useToken } from '../../hooks/token';
import { newGuid } from '../../utils/guid';
import IframeDialog from '../iframe-dialog';

export default function LoginDialog(props: {
    onClose: () => void,
    children: () => JSX.Element
}) {
    const state = useMemo(newGuid, []);
    const [token, setToken] = useToken();

    if(token && !token.isExpired) {
        return props.children();
    }

    return <IframeDialog 
        url={getAuthorizeUrl(state).toString()}
        onClose={props.onClose}
        onMessageReceived={async e => {
            if(e.type !== "on-github-code")
                return;

            if(e.data.state !== state)
                return;
            
            const response = await createApi().apiSignupFromGithubPost({
                body: {
                  gitHubAuthenticationCode: e.data.code
                }
              });
            setToken(response.token ?? "");
        }}
        options={{
            width: 500,
            height: 700
        }} />
}

function getAuthorizeUrl(state: string) {
    const url = new URL("https://github.com/login/oauth/authorize");
    url.searchParams.set("client_id", "72e8a446cc32814bd9c2");
    url.searchParams.set("scope", "user:email");
    url.searchParams.set("state", state);
    url.searchParams.set("redirect_uri", getRedirectUri().toString());
    return url;
}

function getRedirectUri() {
    if(typeof window === "undefined")
        return "";

    const redirectUri = new URL(window.location.href);
    redirectUri.pathname = "/login";
    return redirectUri;
}
