import LoginDialog from "@components/login/login-dialog";
import { useApi } from "@hooks/clients";
import { useEffect } from "react";

export default function () {
    return <LoginDialog isOpen>
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
    
    return null;
}