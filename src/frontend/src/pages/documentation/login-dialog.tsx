import { Button } from "@material-ui/core";
import { useEffect, useState } from "react";
import LoginDialog from "../../components/login/login-dialog";

export default () => {
    const [isReady, setIsReady] = useState(false);
    const [shouldLogIn, setShouldLogIn] = useState(false);

    useEffect(() => {
        if(typeof localStorage === "undefined")
            return;

        localStorage.clear();
        setIsReady(true);
    }, []);

    if(!isReady)
        return <>Not ready yet</>;

    if(!shouldLogIn) {
        return <Button variant="contained" onClick={() => setShouldLogIn(true)}>
            Log in
        </Button>
    }
    
    return (
        <LoginDialog onClose={() => setShouldLogIn(false)}>
            {() => <>Logged in!</>}
        </LoginDialog>
    )
};