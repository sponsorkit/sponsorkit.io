import { AsynchronousProgressDialog } from "@components/progress/asynchronous-progress-dialog";
import { createApi } from "@hooks/clients";
import { DialogContent, DialogTitle, Typography } from "@mui/material";
import { createPopup } from "@utils/popup";
import createAccountValidatior from "./account-validator";

export default function BankDetailsDialog(props: {
    isOpen: boolean,
    onClose: () => void,
    onValidated: () => void
}) {
    const onFillInClicked = async () => {
        const response = await createApi().accountStripeConnectSetupPost();
        
        if(!createPopup(response.activationUrl)) {
            alert("It looks like your browser is blocking the Stripe activation popup. Unblock it, and try again.");
            return false;
        }
    };

    return <AsynchronousProgressDialog
        isOpen={props.isOpen}
        onClose={props.onClose}
        buttonText="Begin"
        isDoneAccessor={createAccountValidatior(account => !!account.beneficiary?.isAccountComplete)}
        requestSentText="Window opened! Waiting for profile completion..."
        requestSendingText="Fetching Stripe activation link..."
        onRequestSending={onFillInClicked}
        onDone={props.onValidated}
    >
        <DialogTitle>We'll send you over to Stripe</DialogTitle>
        <DialogContent>
            <Typography>
                A new window will pop up, which will prompt you to fill in your information through them.
            </Typography>
        </DialogContent>
    </AsynchronousProgressDialog>
}