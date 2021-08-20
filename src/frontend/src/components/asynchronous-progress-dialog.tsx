import { Button, CircularProgress, Dialog, DialogActions, Typography } from "@material-ui/core";
import { Box } from "@material-ui/system";
import { useEffect, useState } from "react";
import * as classes from "./asynchronous-progress-dialog.module.scss";
import { DialogTransition } from "./dialog-transition";

export function AsynchronousProgressDialog(props: {
    isOpen: boolean,
    requestSendingText: string,
    requestSentText: string,
    buttonText: string,
    children: React.ReactNode,
    onClose: () => void,
    onDone?: () => Promise<void>|void,
    isDoneAccessor: () => Promise<boolean|null>|boolean|null,
    onRequestSending: () => Promise<boolean|void>|boolean|void,
    actionChildren?: React.ReactNode
}) {
    const [isLoading, setIsLoading] = useState(false);
    const [isWaitingForVerification, setIsWaitingForVerification] = useState(false);

    useEffect(
        () => {
            let timerId: any;

            async function effect() {
                if(isWaitingForVerification) {
                    const isDone = await Promise.resolve(props.isDoneAccessor());
                    if(isDone === null)
                        return setIsWaitingForVerification(false);

                    if(isDone) {
                        setIsLoading(false);
                        setIsWaitingForVerification(false);

                        if(props.onDone)
                            props.onDone();
                        
                        props.onClose();

                        return;
                    }
                }

                timerId = setTimeout(effect, 1000);
            }

            timerId = setTimeout(effect, 1000);

            return () => {
                clearTimeout(timerId);
            }
        },
        [isWaitingForVerification]);

    const onVerifyClicked = async () => {
        setIsLoading(true);

        try {
            const didValidate = await Promise.resolve(props.onRequestSending());
            if(typeof didValidate === "boolean" && !didValidate)
                return;
            
            setIsWaitingForVerification(true);
        } finally {
            setIsLoading(false);
        }
    };

    const isVerificationDisabled = isLoading || isWaitingForVerification;

    return <Dialog
        open={props.isOpen}
        onClose={() => {
            props.onClose();
        }}
        TransitionComponent={DialogTransition}
        className={classes.root}
    >
        {props.children}
        <DialogActions>
            {(isLoading || isWaitingForVerification) ?
                <Box display="flex" flexDirection="row" alignItems="center">
                    <CircularProgress 
                        size={25}
                        variant="indeterminate" />
                    <Typography className={classes.loadingText}>
                        {isWaitingForVerification ? 
                            props.requestSentText : 
                            props.requestSendingText}
                    </Typography>
                </Box> :
                props.actionChildren}
            <Box className={classes.spacer} />
            <Button
                disabled={isLoading}
                onClick={props.onClose}
                color="secondary"
            >
                Cancel
            </Button>
            <Button
                disabled={isVerificationDisabled}
                onClick={onVerifyClicked}
                variant="contained"
            >
                {props.buttonText}
            </Button>
        </DialogActions>
    </Dialog>
}