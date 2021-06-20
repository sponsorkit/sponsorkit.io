import { Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Slide, Tooltip, Typography } from "@material-ui/core";
import { TransitionProps } from "@material-ui/core/transitions/transition";
import { Stripe, StripeCardNumberElement } from "@stripe/stripe-js";
import React, { useEffect, useState } from "react";
import { GeneralApiAccountPaymentMethodIntentGetResponse } from "../../../api/openapi/src";
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
    children: () => Promise<void> | void,
    onClose: () => void
}) {
    const [stripe, setStripe] = useState<Stripe>();
    const [cardNumberElement, setCardNumberElement] = useState<StripeCardNumberElement | null>(null);
    const [intentResponse, setIntentResponse] = useState<GeneralApiAccountPaymentMethodIntentGetResponse|null>(null);

    const [isReady, setIsReady] = useState(false);

    const paymentMethodAvailability = useApi(
        async client => {
            const response = await client.apiAccountPaymentMethodAvailabilityGet({});
            return response?.availability;
        },
        []);

    useEffect(
        () => {
            async function effect() {
                if(!paymentMethodAvailability)
                    return;

                if(paymentMethodAvailability === "available") {
                    setIsReady(true);
                    return;
                }

                const intentResponse = await createApi().apiAccountPaymentMethodIntentGet({});
                if(!intentResponse.setupIntentClientSecret)
                    throw new Error("No setup intent could be found.");

                setIntentResponse(intentResponse);
                setIsReady(true);
            }

            effect();
        },
        [paymentMethodAvailability]);

    const onCancelClicked = () => {
        props.onClose();
    };

    const onSubmitClicked = async () => {
        if(!isReady)
            return;
        
        if(intentResponse?.setupIntentClientSecret) {
            if(!cardNumberElement)
                throw new Error("Card number element not found.");

            const confirmationResponse = await stripe?.confirmCardSetup(
                intentResponse.setupIntentClientSecret,
                {
                    payment_method: {
                        card: cardNumberElement
                    }
                });
            if(confirmationResponse?.error)
                throw confirmationResponse.error;
        }

        await Promise.resolve(props.children);

        props.onClose();
    }

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
                <Box className={`${classes.creditCardWrapper} ${isReady && classes.ready}`}>
                    <Elements>
                        <StripeCreditCard
                            onInitialized={context => setStripe(context.stripe)}
                            onChanged={setCardNumberElement}
                        />
                    </Elements>
                </Box>
                <Box className={classes.progressWrapper}>
                    <CircularProgress className={`${classes.progress} ${isReady && classes.ready}`} />
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
                onClick={onSubmitClicked}
                variant="contained"
                disabled={!isReady}
            >
                Submit
            </Button>
        </DialogActions>
    </Dialog>;
}

export function PaymentMethodModal(props: {
    children: () => Promise<void> | void,
    onClose: () => void
}) {
    return <LoginDialog onClose={props.onClose}>
        {() => <PaymentMethodModalContent {...props}>
            {props.children}
        </PaymentMethodModalContent>}
    </LoginDialog>;
}