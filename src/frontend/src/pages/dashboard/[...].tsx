import createAccountValidatior from "@components/account/account-validator";
import EmailValidationDialog from "@components/account/email-validation-dialog";
import { AsynchronousProgressDialog } from "@components/asynchronous-progress-dialog";
import ProgressList from "@components/progress-list";
import { Box, Card, CardContent, Container, DialogContent, DialogTitle, Typography } from "@material-ui/core";
import { isPopupBlocked } from "@utils/popup";
import React, { useState } from "react";
import { AppBarTemplate } from "..";
import PrivateRoute from "../../components/login/private-route";
import { createApi, useApi } from "../../hooks/clients";
import * as classes from "./[...].module.scss";

function DashboardPage() {
    const [isValidatingEmail, setIsValidatingEmail] = useState(false);
    const [isFillingInBankDetails, setIsFillingInBankDetails] = useState(false);
    const [lastProgressChange, setLastProgressChange] = useState(new Date());

    const account = useApi(
        async client => await client.accountGet(),
        [lastProgressChange]);

    return <AppBarTemplate logoVariant="sponsorkit">
        {account && <EmailValidationDialog
            email={account.email}
            isOpen={isValidatingEmail}
            onValidated={() => setLastProgressChange(new Date())}
            onClose={() => setIsValidatingEmail(false)} />}
        <BankDetailsDialog
            isOpen={isFillingInBankDetails}
            onValidated={() => setLastProgressChange(new Date())}
            onClose={() => setIsFillingInBankDetails(false)} />
        <Container
            maxWidth="lg"
            className={classes.root}
        >
            <Typography variant="h2" component="h2" className={classes.profileCompletionHeader}>
                Profile
            </Typography>
            <Box className={classes.accountOverviews}>
                <Card className={classes.accountOverview}>
                    <CardContent>
                        <ProgressList
                            validationTarget={account}
                            title="Profile completion"
                            subTitle="Your beneficiary details are used when you want to earn money from bounties, donations or sponsorships. Your sponsor details are used when you want to place bounties, give donations or start sponsoring others."
                            checkpoints={[
                                {
                                    label: "Connect your GitHub account",
                                    description: "Connecting your GitHub account is required for receiving bounties, donations, or sponsorships.",
                                    validate: account => !!account?.gitHubUsername
                                },
                                {
                                    label: "Change or verify e-mail address",
                                    description: "Verifying your e-mail address allows you to receive an e-mail whenever you earn money, and when your card has been charged (invoices).",
                                    validate: account => account?.isEmailVerified || false,
                                    onClick: () => setIsValidatingEmail(true)
                                },
                                {
                                    label: "Save payment details for later",
                                    description: "Payment information is stored with Stripe. Saving it makes it easier for you to create bounties, donations or sponsor someone in the future.",
                                    validate: account => !!account?.sponsor?.creditCard
                                },
                                {
                                    label: "Fill in your bank account details",
                                    description: "Filling in your bank account and payout details with Stripe allows you to withdraw earned money to your bank account.",
                                    validate: account => !!account?.beneficiary?.isAccountComplete,
                                    onClick: () => setIsFillingInBankDetails(true)
                                }
                            ]}
                        />
                    </CardContent>
                </Card>
            </Box>
        </Container>
    </AppBarTemplate>;
}

function BankDetailsDialog(props: {
    isOpen: boolean,
    onClose: () => void,
    onValidated: () => void
}) {
    const onFillInClicked = async () => {
        const response = await createApi().accountStripeConnectSetupPost();
        
        const popup = window.open(response.activationUrl);
        if(isPopupBlocked(popup)) {
            alert("It looks like your browser is blocking the Stripe activation popup. Unblock it, and try again.");
            return false;
        }
    };

    return <AsynchronousProgressDialog
        isOpen={props.isOpen}
        onClose={props.onClose}
        buttonText="Begin"
        isDoneAccessor={createAccountValidatior(account => !!account.beneficiary)}
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

export default function () {
    return <PrivateRoute
        component={DashboardPage}
        path="/dashboard" />
}