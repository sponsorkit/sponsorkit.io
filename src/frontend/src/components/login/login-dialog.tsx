import { useConfiguration } from '@hooks/configuration';
import React, { useMemo, useRef } from 'react';
import { createApi } from '@hooks/clients';
import { useToken } from '@hooks/token';
import { newGuid } from '@utils/guid';
import IframeDialog from '../iframe-dialog';
import { SponsorkitDomainControllersApiConfigurationResponse } from '@sponsorkit/client';

export default function LoginDialog(props: {
    onDismissed?: () => void,
    onPopupFailed?: () => void,
    children: () => JSX.Element
}) {
    const state = useMemo(newGuid, []);
    const [token, setToken] = useToken();
    const configuration = useConfiguration();
    const wasDismissed = useRef(true);

    if(token && !token.isExpired) {
        return props.children();
    }

    if(configuration === undefined)
        return null;

    const onClose = () => {
        if(!props.onDismissed)
            return;

        if(!wasDismissed.current)
            return;

        props.onDismissed();
    }

    return <IframeDialog 
        url={getAuthorizeUrl(state, configuration).toString()}
        onClose={onClose}
        onPopupFailed={props.onPopupFailed}
        onMessageReceived={async e => {
            if(e.type !== "on-github-code")
                return;

            if(e.data.state !== state)
                return;

            wasDismissed.current = false;
            
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

function getAuthorizeUrl(state: string, configuration: SponsorkitDomainControllersApiConfigurationResponse) {
    const url = new URL("https://github.com/login/oauth/authorize");
    url.searchParams.set("client_id", configuration.gitHubClientId);
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
