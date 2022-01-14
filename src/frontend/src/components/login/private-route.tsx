import getDialogTransitionProps from "@components/transitions/dialog-transition";
import { useConfiguration } from "@hooks/configuration";
import { GitHub } from "@mui/icons-material";
import { Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from "@mui/material";
import React, { useState } from "react";
import LoginDialog from "./login-dialog";
import * as classes from "./private-route.module.scss";

export default function PrivateRoute({ component, ...rest }: {
    component: any
}) {
    const [shouldShowLoginDialog, setShouldShowLoginDialog] = useState(true);
    const configuration = useConfiguration();

    const ComponentToUse = component;
    if(!ComponentToUse)
        return null;

    const onDismissed = () => {
        history.back();
    }

    const onPopupFailed = () => {
        setShouldShowLoginDialog(false);
    }

    const onSignInClicked = () => {
        setShouldShowLoginDialog(true);
    }

    if(!shouldShowLoginDialog) {
        return <Dialog 
            open
            {...getDialogTransitionProps()}
        >
            <DialogTitle>Sign in to continue</DialogTitle>
            <DialogContent className={classes.root}>
                <Typography className={classes.subtext}>
                    You need to sign in or sign up with GitHub to continue.
                </Typography>
            </DialogContent>
            <DialogActions>
                <Button 
                    onClick={onSignInClicked}
                    variant="contained"
                    startIcon={<GitHub />}
                >
                    Sign in
                </Button>
            </DialogActions>
        </Dialog>
    }
    
    if(!configuration)
        return <CircularProgress />;

    return <LoginDialog 
        isOpen={shouldShowLoginDialog}
        onDismissed={onDismissed}
        onPopupFailed={onPopupFailed}
        configuration={configuration}
    >
        {() => <ComponentToUse {...rest} />}
    </LoginDialog>;
}
