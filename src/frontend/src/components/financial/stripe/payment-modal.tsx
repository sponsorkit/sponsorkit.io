import { AsynchronousProgressDialog } from "@components/asynchronous-progress-dialog";
import { createApi } from "@hooks/clients";
import { Box, CircularProgress, DialogContent, DialogTitle, FormHelperText, Tooltip, Typography } from "@material-ui/core";
import { Stripe, StripeCardNumberElement, StripeError } from "@stripe/stripe-js";
import React, { useEffect, useState } from "react";
import LoginDialog from "../../login/login-dialog";
import PoweredByStripeBadge from "./assets/powered-by-stripe.inline.svg";
import StripeCreditCard from "./credit-card";
import Elements from "./elements";
import * as classes from "./payment-modal.module.scss";

type IntentResponse = {
    clientSecret: string,
    existingPaymentMethodId?: string
};

type Props = {
    onClose: () => void,
    onAcquirePaymentIntent: () => Promise<IntentResponse>,
    onComplete: () => Promise<void> | void
};

function PaymentMethodModalContent(props: Props) {
    const [stripe, setStripe] = useState<Stripe>();
    const [cardNumberElement, setCardNumberElement] = useState<StripeCardNumberElement | null>(null);
    const [intentResponse, setIntentResponse] = useState<IntentResponse | null>(null);
    const [error, setError] = useState<StripeError | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [isInitializing, setIsInitializing] = useState(false);

    useEffect(
        () => {
            async function effect() {
                setIsLoading(true);
                setIsInitializing(true);

                try {
                    const intentResponse = await props.onAcquirePaymentIntent();
                    if (!intentResponse.clientSecret)
                        throw new Error("No intent secret was found.");

                    setIntentResponse(intentResponse);
                } finally {
                    setIsLoading(false);
                    setIsInitializing(false);
                }
            }

            effect();
        },
        []);

    const isDoneAccessor = async () => {
        if (!intentResponse)
            throw new Error("No intent response.");

        var result = await stripe?.retrieveSetupIntent(intentResponse.clientSecret);
        if (!result)
            throw new Error("No intent.");

        if (result.error) {
            setError(result.error);
            return null;
        }

        const setupIntent = result.setupIntent;
        if (setupIntent.status === "processing")
            return false;

        if (setupIntent?.status !== "succeeded")
            throw new Error("Did not expect payment intent status: " + setupIntent?.status);

        const bountyIntentResponse = await createApi().bountiesPaymentIntentIdGet(setupIntent.id);
        return bountyIntentResponse.isProcessed;
    }

    const onSubmitPayment = async () => {
        if (!intentResponse)
            return;

        setError(null);
        setIsLoading(true);

        try {
            const confirmationResponse = await stripe?.confirmCardSetup(
                intentResponse.clientSecret,
                {
                    payment_method:
                        intentResponse.existingPaymentMethodId ??
                        { card: cardNumberElement! }
                });
            if (confirmationResponse?.error)
                return setError(confirmationResponse.error);

            let setupIntent = confirmationResponse?.setupIntent;
            if (!setupIntent)
                throw new Error("No payment intent found.");
        } catch (e) {
            setIsLoading(false);
            throw e;
        }
    }

    const onCancelClicked = () => {
        props.onClose();
    };

    const isReady = !!intentResponse && !isLoading;

    return <AsynchronousProgressDialog
        isOpen
        isSubmitDisabled={isLoading}
        onClose={onCancelClicked}
        buttonText="Submit"
        requestSendingText="Submitting..."
        requestSentText="Verifying..."
        isDoneAccessor={isDoneAccessor}
        onRequestSending={onSubmitPayment}
        onDone={props.onComplete}
        actionChildren={<>
            <Tooltip title="Stripe is one of the most popular and trusted payment providers in the world. Your credit card details are safe with them, and never touches our own servers.">
                <Box className={classes.stripeBadge}>
                    <PoweredByStripeBadge className={classes.svg} />
                </Box>
            </Tooltip>
            <Box className={classes.spacer} />
        </>}
    >
        <DialogTitle>Enter payment details</DialogTitle>
        <DialogContent className={classes.root}>
            <Typography className={classes.subtext}>
                To continue, we need your payment details. Your card won't actually be charged until the bounty is claimed, but we'll verify the card now and save it with Stripe.
            </Typography>
            <Box className={classes.paymentVeil}>
                <Box className={`${classes.creditCardWrapper} ${isReady && classes.ready} ${isInitializing && classes.initializing}`}>
                    <Elements>
                        <StripeCreditCard
                            onInitialized={context => setStripe(context.stripe)}
                            onChanged={setCardNumberElement}
                        />
                    </Elements>
                </Box>
                <Box className={classes.progressWrapper}>
                    <CircularProgress className={`${classes.progress} ${isReady && classes.ready} ${isInitializing && classes.initializing}`} />
                </Box>
            </Box>
            {error && !isLoading &&
                <Box>
                    <FormHelperText error>
                        {error.message}
                    </FormHelperText>
                </Box>}
        </DialogContent>
    </AsynchronousProgressDialog>;
}

export function PaymentMethodModal(props: Props) {
    return <LoginDialog>
        {() => <PaymentMethodModalContent {...props} />}
    </LoginDialog>;
}