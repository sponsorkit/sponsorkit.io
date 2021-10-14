import LoginDialog from "@components/login/login-dialog";
import { useApi } from "@hooks/clients";
import { useConfiguration } from "@hooks/configuration";
import { CircularProgress } from "@mui/material";
import { useEffect } from "react";

export default function () {
    const configuration = useConfiguration();
    if(!configuration)
        return <CircularProgress />;

    return <LoginDialog 
        isOpen
        configuration={configuration}
        onDismissed={() => {}}
    >
        {() => <ActivateContents />}
    </LoginDialog>
}

function ActivateContents() {
    const link = useApi(
        async (client, abortSignal) => await client.accountStripeConnectActivateGet({
            abortSignal
        }),
        []);
    useEffect(() => {
        if(!link)
            return;

        window.location.href = link.url;
    }, [link]);
    
    return <CircularProgress />;
}