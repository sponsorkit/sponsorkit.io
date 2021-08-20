import { createApi } from "@hooks/clients";
import { Button, CircularProgress, Dialog, DialogActions, Typography } from "@material-ui/core";
import { Box } from "@material-ui/system";
import { useEffect, useState } from "react";
import { SponsorkitDomainControllersApiAccountResponse } from "src/api/openapi/src";
import * as classes from "./asynchronous-progress-dialog.module.scss";
import { DialogTransition } from "./dialog-transition";

export function AsynchronousProgressDialog(props: {
    isOpen: boolean,
    requestSendingText: string,
    requestSentText: string,
    buttonText: string,
    children: React.ReactNode,
    onClose: () => void,
    onValidated: () => void,
    isValidatedAccessor: (account: SponsorkitDomainControllersApiAccountResponse) => boolean,
    onValidating: () => Promise<boolean|void>|boolean|void
}) {
    const [isLoading, setIsLoading] = useState(false);
    const [isWaitingForVerification, setIsWaitingForVerification] = useState(false);

    useEffect(
        () => {
            let timerId: any;

            async function effect() {
                if(isWaitingForVerification) {
                    const account = await createApi().accountGet();
                    if(props.isValidatedAccessor(account)) {
                        setIsLoading(false);
                        setIsWaitingForVerification(false);

                        props.onValidated();
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
            const didValidate = await Promise.resolve(props.onValidating());
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
            {(isLoading || isWaitingForVerification) &&
                <Box display="flex" flexDirection="row" alignItems="center">
                    <CircularProgress 
                        size={25}
                        variant="indeterminate" />
                    <Typography className={classes.loadingText}>
                        {isWaitingForVerification ? 
                            props.requestSentText : 
                            props.requestSendingText}
                    </Typography>
                </Box>}
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