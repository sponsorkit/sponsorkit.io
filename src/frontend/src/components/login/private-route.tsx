import { RouteComponentProps } from "@reach/router";
import React from "react";
import LoginDialog from "./login-dialog";

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
