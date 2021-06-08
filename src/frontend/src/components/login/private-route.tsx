import React from "react";
import { useToken } from "../../hooks/token";
import LoginDialog from "./login-dialog";
import { RouteComponentProps } from "@reach/router";

export default function PrivateRoute({ component, location, ...rest }: RouteComponentProps<{
    component: any
}>) {
    const [token] = useToken();
    const isAnonymous = !token || token.isExpired;
    if (isAnonymous)
        return <LoginDialog open={true} />;

    const ComponentToUse = component;
    if(!ComponentToUse)
        return null;

    return <ComponentToUse {...rest} />
}
