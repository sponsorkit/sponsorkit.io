import { DialogTitle, Typography, Dialog, DialogContent, DialogActions, Button, Slide } from "@material-ui/core";
import { TransitionProps } from "@material-ui/core/transitions";
import { GitHub } from "@material-ui/icons";
import { RouteComponentProps } from "@reach/router";
import React from "react";
import {useState} from "react";
import LoginDialog from "./login-dialog";
import * as classes from "./private-route.module.scss";

const Transition = React.forwardRef(function Transition(
    props: TransitionProps & { children?: React.ReactElement<any, any> },
    ref: React.Ref<unknown>,
) {
    return <Slide direction="up" ref={ref} {...props} />;
});

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
            TransitionComponent={Transition}
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
        onDismissed={onDismissed}
        onPopupFailed={onPopupFailed}
    >
        {() => <ComponentToUse {...rest} />}
    </LoginDialog>;
}
