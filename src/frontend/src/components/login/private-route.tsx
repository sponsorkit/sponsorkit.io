import getDialogTransitionProps from "@components/dialog-transition";
import { Button, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from "@material-ui/core";
import { GitHub } from "@material-ui/icons";
import { RouteComponentProps } from "@reach/router";
import React, { useState } from "react";
import LoginDialog from "./login-dialog";
import * as classes from "./private-route.module.scss";

export default function PrivateRoute({ component, location, ...rest }: RouteComponentProps<{
    component: any
}>) {
    const [shouldShowLoginDialog, setShouldShowLoginDialog] = useState(true);

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

    return <LoginDialog 
        isOpen={shouldShowLoginDialog}
        onDismissed={onDismissed}
        onPopupFailed={onPopupFailed}
    >
        {() => <ComponentToUse {...rest} />}
    </LoginDialog>;
}
