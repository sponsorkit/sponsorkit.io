import { AsynchronousProgressDialog } from "@components/progress/asynchronous-progress-dialog";
import { createApi } from "@hooks/clients";
import { DialogContent, DialogTitle, TextField, Typography } from "@mui/material";
import { useState } from "react";
import createAccountValidatior from "./account-validator";
import classes from "./email-validation-dialog.module.scss";

export default function EmailValidationDialog(props: {
    email: string,
    isOpen: boolean,
    onClose: () => void,
    onValidated: () => void
}) {
    const [email, setEmail] = useState(() => props.email);

    const onVerifyClicked = async (broadcastId: string) => {
        await createApi().accountEmailSendVerificationEmailPost({
            body: {
                email,
                broadcastId
            }
        });
    };

    return <AsynchronousProgressDialog
        isOpen={props.isOpen}
        onClose={props.onClose}
        buttonText="Verify"
        isDoneAccessor={createAccountValidatior(account => account.isEmailVerified)}
        requestSentText="E-mail sent! Waiting for your verification..."
        requestSendingText="Sending e-mail verification..."
        onRequestSending={onVerifyClicked}
        onDone={props.onValidated}
    >
        <DialogTitle>Is this your e-mail?</DialogTitle>
        <DialogContent className={classes["verify-email-dialog"]}>
            <Typography>
                Make sure your e-mail is correct. We'll send you an e-mail with a verification link.
            </Typography>
            <TextField
                label="E-mail"
                variant="outlined"
                autoFocus
                className={classes["text-box"]}
                value={email}
                onChange={e => setEmail(e.target.value)} />
        </DialogContent>
    </AsynchronousProgressDialog>
}