import React from "react";
import { useToken } from "../../hooks/token";
import LoginDialog from "./login-dialog";
import { RouteComponentProps } from "@reach/router";

export default function PrivateRoute({ component, location, ...rest }: RouteComponentProps<{
    component: any
}>) {
    const ComponentToUse = component;
    if(!ComponentToUse)
        return null;

    return <LoginDialog>
        {() => <ComponentToUse {...rest} />}
    </LoginDialog>;
}
