import BankDetailsDialog from "@components/account/bank-details-dialog";
import EmailValidationDialog from "@components/account/email-validation-dialog";
import { PaymentMethodModal } from "@components/financial/stripe/payment-modal";
import PrivateRoute from "@components/login/private-route";
import ProgressList from "@components/progress/progress-list";
import { createApi, useApi } from "@hooks/clients";
import { useConfiguration } from "@hooks/configuration";
import { Box, Card, CardContent, CircularProgress, Container, Typography } from "@mui/material";
import React, { useState } from "react";
import { AppBarLayout } from "..";
import classes from "./index.module.scss";

function DashboardPage() {
    const [isValidatingEmail, setIsValidatingEmail] = useState(false);
    const [isFillingInBankDetails, setIsFillingInBankDetails] = useState(false);
    const [isFillingInPaymentDetails, setIsFillingInPaymentDetails] = useState(false);
    const [lastProgressChange, setLastProgressChange] = useState(new Date());

    const account = useApi(
        async client => await client.accountGet(),
        [lastProgressChange]);

    const configuration = useConfiguration();
    if(!configuration)
        return <CircularProgress />;

    return <AppBarLayout logoVariant="sponsorkit">
        {account && <EmailValidationDialog
            email={account.email}
            isOpen={isValidatingEmail}
            onValidated={() => setLastProgressChange(new Date())}
            onClose={() => setIsValidatingEmail(false)} />}
        <BankDetailsDialog
            isOpen={isFillingInBankDetails}
            onValidated={() => setLastProgressChange(new Date())}
            onClose={() => setIsFillingInBankDetails(false)} />
        <PaymentMethodModal
            isOpen={isFillingInPaymentDetails}
            onComplete={() => setLastProgressChange(new Date())}
            onClose={() => setIsFillingInPaymentDetails(false)}
            configuration={configuration}
            onAcquirePaymentIntent={async () => {
                const response = await createApi().accountPaymentMethodIntentPost();
                if (!response)
                    throw new Error("Could not create intent for payment method update.");

                return {
                    clientSecret: response.paymentIntentClientSecret,
                    existingPaymentMethodId: response.existingPaymentMethodId
                }
            }}
        />
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
                                    validate: account => !!account?.sponsor?.creditCard,
                                    onClick: () => setIsFillingInPaymentDetails(true)
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
    </AppBarLayout>;
}

export default function () {
    return <PrivateRoute
        component={DashboardPage} />
}