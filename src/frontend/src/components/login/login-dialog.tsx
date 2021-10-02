import { createApi } from '@hooks/clients';
import { useConfiguration } from '@hooks/configuration';
import { useToken } from '@hooks/token';
import { SponsorkitDomainControllersApiConfigurationResponse } from '@sponsorkit/client';
import { newGuid } from '@utils/guid';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import IframeDialog from '../iframe-dialog';

export default function LoginDialog(props: {
    isOpen: boolean,
    onDismissed?: () => void,
    onPopupFailed?: () => void,
    children: () => JSX.Element|null|undefined
}) {
    const [isOpen, setIsOpen] = useState(() => props.isOpen);
    const state = useMemo(newGuid, []);
    const [token, setToken] = useToken();
    const configuration = useConfiguration();
    const wasDismissed = useRef(true);

    useEffect(
        () => {
            if(props.isOpen) {
                setIsOpen(true);
            } else if(!token) {
                setIsOpen(false);
            }
        },
        [props.isOpen]);

    if(configuration === undefined || !isOpen)
        return <></>;

    if(token) {
        return props.children() || <></>;
    }

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
