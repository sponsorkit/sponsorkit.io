import { Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Slide, Tooltip, Typography } from "@material-ui/core";
import { TransitionProps } from "@material-ui/core/transitions/transition";
import { Stripe, StripeCardNumberElement } from "@stripe/stripe-js";
import React, { useEffect, useState } from "react";
import { GeneralApiAccountPaymentMethodIntentGetResponse } from "@sponsorkit/client";
import { createApi, useApi } from "../../../hooks/clients";
import LoginDialog from "../../login/login-dialog";
import StripeCreditCard from "./credit-card";
import Elements from "./elements";
import * as classes from "./payment-method-modal.module.scss";
import PoweredByStripeBadge from "./assets/powered-by-stripe.inline.svg";

const Transition = React.forwardRef(function Transition(
    props: TransitionProps & { children?: React.ReactElement<any, any> },
    ref: React.Ref<unknown>,
) {
    return <Slide direction="up" ref={ref} {...props} />;
});

function PaymentMethodModalContent(props: {
    onClose: () => void,
    onPaymentMethodAdded: () => Promise<void>|void
}) {
    const [stripe, setStripe] = useState<Stripe>();
    const [cardNumberElement, setCardNumberElement] = useState<StripeCardNumberElement | null>(null);
    const [intentResponse, setIntentResponse] = useState<GeneralApiAccountPaymentMethodIntentGetResponse|null>(null);

    useEffect(
        () => {
            async function effect() {
                const intentResponse = await createApi().apiAccountPaymentMethodIntentGet({});
                if(!intentResponse.setupIntentClientSecret)
                    throw new Error("No setup intent could be found.");

                setIntentResponse(intentResponse);
            }

            effect();
        },
        []);
        
    useEffect(
        () => {
            /**
             * If an existing payment method already exists, we just 3D secure the existing one.
             */
            async function effect() {
                if(!intentResponse)
                    return;

                if(!intentResponse.existingPaymentMethodId)
                    return;

                onCreditCardReady();
            }

            effect();
        },
        [intentResponse]);

    const onCancelClicked = () => {
        props.onClose();
    };

    const onCreditCardReady = async () => {
        if(!intentResponse)
            return;

        if(!intentResponse.existingPaymentMethodId && !cardNumberElement)
            throw new Error("Card not inferred.");
        
        const confirmationResponse = await stripe?.confirmCardSetup(
            intentResponse.setupIntentClientSecret,
            {
                payment_method: intentResponse.existingPaymentMethodId ?? 
                { card: cardNumberElement! }
            });
        if(confirmationResponse?.error)
            throw confirmationResponse.error;

        await createApi().apiAccountPaymentMethodApplyPost({});

        await Promise.resolve(props.onPaymentMethodAdded());

        props.onClose();
    }

    if(!intentResponse)
        return null;

    if(!!intentResponse.existingPaymentMethodId)
        return null;

    return <Dialog 
        open
        TransitionComponent={Transition}
    >
        <DialogTitle>Enter payment details</DialogTitle>
        <DialogContent className={classes.root}>
            <Typography className={classes.subtext}>
                To continue, we need your payment details.
            </Typography>
            <Box className={classes.paymentVeil}>
                <Box className={`${classes.creditCardWrapper} ${!!intentResponse && classes.ready}`}>
                    <Elements>
                        <StripeCreditCard
                            onInitialized={context => setStripe(context.stripe)}
                            onChanged={setCardNumberElement}
                        />
                    </Elements>
                </Box>
                <Box className={classes.progressWrapper}>
                    <CircularProgress className={`${classes.progress} ${!!intentResponse && classes.ready}`} />
                </Box>
            </Box>
        </DialogContent>
        <DialogActions className={classes.dialogActions}>
            <Tooltip title="Stripe is one of the most popular and trusted payment providers in the world. Your credit card details are safe with them, and never touches our own servers.">
                <Box className={classes.stripeBadge}>
                    <PoweredByStripeBadge className={classes.svg} />
                </Box>
            </Tooltip>
            <Box className={classes.spacer} />
            <Button 
                onClick={onCancelClicked}
                color="secondary"
            >
                Cancel
            </Button>
            <Button 
                onClick={onCreditCardReady}
                variant="contained"
                disabled={!intentResponse}
            >
                Submit
            </Button>
        </DialogActions>
    </Dialog>;
}

export function PaymentMethodModal(props: {
    onClose: () => void,
    onPaymentMethodAdded: () => Promise<void>|void
}) {
    return <LoginDialog onClose={props.onClose}>
        {() => <PaymentMethodModalContent {...props} />}
    </LoginDialog>;
}