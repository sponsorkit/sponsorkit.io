import { AsynchronousProgressDialog } from "@components/progress/asynchronous-progress-dialog";
import { Box, CircularProgress, DialogContent, DialogTitle, FormHelperText, Tooltip } from "@mui/material";
import { ConfigurationGetResponse } from "@sponsorkit/client";
import { SetupIntent, Stripe, StripeCardNumberElement, StripeError } from "@stripe/stripe-js";
import { combineClassNames } from "@utils/strings";
import Image from "next/image";
import React, { useEffect, useState } from "react";
import LoginDialog from "../../login/login-dialog";
import PoweredByStripeBadge from "./assets/powered-by-stripe.inline.svg";
import StripeCreditCard from "./credit-card";
import Elements from "./elements";
import classes from "./payment-modal.module.scss";

type IntentResponse = {
    clientSecret: string,
    existingPaymentMethodId?: string
};

type Props = {
    isOpen: boolean,
    configuration: ConfigurationGetResponse,
    onClose: () => void,
    onAcquirePaymentIntent: () => Promise<IntentResponse>,
    isDoneAccessor?: (intent: SetupIntent) => Promise<boolean>,
    onComplete: () => Promise<void> | void,
    beforeChildren?: React.ReactNode,
    afterChildren?: React.ReactNode,
    isDisabled?: boolean
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
            async function onOpen() {
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

            async function onClose() {
                setError(null);
                setIntentResponse(null);
                setCardNumberElement(null);
                setStripe(undefined);
                setIsLoading(false);
                setIsInitializing(false);
            }

            props.isOpen && onOpen();
            !props.isOpen && onClose();
        },
        [props.isOpen]);

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

        if (setupIntent?.status !== "succeeded") {
            console.warn("Did not expect payment intent status", setupIntent?.status);
            return null;
        }

        if(props.isDoneAccessor)
            return await props.isDoneAccessor(setupIntent);

        return true;
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
            console.debug("confirmation-response", confirmationResponse);
            if (confirmationResponse?.error)
                return setError(confirmationResponse.error);

            let setupIntent = confirmationResponse?.setupIntent;
            if (!setupIntent)
                throw new Error("No payment intent found.");
        } catch (e) {
            console.warn("on-submit-payment-error", e);
            throw e;
        } finally {
            setIsLoading(false);
        }
    }

    const onCancelClicked = () => {
        props.onClose();
    };

    const isReady = !!intentResponse && !isLoading;

    return <AsynchronousProgressDialog
        isOpen={props.isOpen}
        isSubmitDisabled={
            isLoading || 
            !cardNumberElement ||
            props.isDisabled}
        onClose={onCancelClicked}
        buttonText="Submit"
        requestSendingText="Submitting..."
        requestSentText="Verifying..."
        isDoneAccessor={isDoneAccessor}
        onRequestSending={onSubmitPayment}
        onDone={props.onComplete}
        actionChildren={<>
            <Tooltip title="Stripe is one of the most popular and trusted payment providers in the world. Your credit card details are safe with them, and never touches our own servers.">
                <Box className={classes["stripe-badge"]}>
                    <Image layout="fill" src={PoweredByStripeBadge} className={classes.svg} />
                </Box>
            </Tooltip>
            <Box className={classes.spacer} />
        </>}
    >
        <DialogTitle>Enter payment details</DialogTitle>
        <DialogContent className={classes.root}>
            {props.beforeChildren}
            <Box className={classes["payment-veil"]}>
                <Box className={combineClassNames(
                    classes["credit-card-wrapper"],
                    isReady && classes.ready,
                    isInitializing && classes.initializing)}
                >
                    <Elements>
                        <StripeCreditCard
                            onInitialized={context => setStripe(context.stripe)}
                            onChanged={setCardNumberElement}
                        />
                    </Elements>
                </Box>
                <Box className={classes["progress-wrapper"]}>
                    <CircularProgress className={combineClassNames(
                        classes.progress,
                        isReady && classes.ready,
                        isInitializing && classes.initializing)} />
                </Box>
            </Box>
            {props.afterChildren}
            {error && !isLoading &&
                <FormHelperText className={classes.error} error>
                    {error.message}
                </FormHelperText>}
        </DialogContent>
    </AsynchronousProgressDialog>;
}

export function PaymentMethodModal(props: Props) {
    return <LoginDialog 
        isOpen={props.isOpen}
        configuration={props.configuration}
        onDismissed={props.onClose}
    >
        {() => <PaymentMethodModalContent {...props} />}
    </LoginDialog>;
}