import { createApi } from '@hooks/clients';
import { useToken } from '@hooks/token';
import { ConfigurationGetResponse, SponsorkitDomainControllersApiConfigurationResponse } from '@sponsorkit/client';
import { newGuid } from '@utils/guid';
import React, { useMemo } from 'react';
import IframeDialog from '../iframe-dialog';

export default function LoginDialog(props: {
    isOpen: boolean,
    configuration: ConfigurationGetResponse,
    onDismissed: () => void,
    onPopupFailed?: () => void,
    children: () => JSX.Element|null|undefined
}) {
    const state = useMemo(newGuid, []);
    const [token, setToken] = useToken();


    if(!props.isOpen)
        return <></>;

    if(token) {
        return props.children() || <></>;
    }

    const onClose = () => {
        console.debug("on-close");

        props.onDismissed();
    }

    return <IframeDialog 
        url={getAuthorizeUrl(state, props.configuration).toString()}
        onClose={onClose}
        onPopupFailed={props.onPopupFailed}
        onMessageReceived={async e => {
            if(e.type !== "on-github-code")
                return;

            if(e.data.state !== state)
                return;

            const response = await createApi().accountSignupFromGithubPost({
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
