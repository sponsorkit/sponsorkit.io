import { Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, FormHelperText, Slide, Tooltip, Typography } from "@material-ui/core";
import { TransitionProps } from "@material-ui/core/transitions/transition";
import { Stripe, StripeCardNumberElement, StripeError } from "@stripe/stripe-js";
import React, { useEffect, useState } from "react";
import LoginDialog from "../../login/login-dialog";
import StripeCreditCard from "./credit-card";
import Elements from "./elements";
import * as classes from "./payment-modal.module.scss";
import PoweredByStripeBadge from "./assets/powered-by-stripe.inline.svg";
import { delay } from "@utils/time";

const Transition = React.forwardRef(function Transition(
    props: TransitionProps & { children?: React.ReactElement<any, any> },
    ref: React.Ref<unknown>,
) {
    return <Slide direction="up" ref={ref} {...props} />;
});

type IntentResponse = {
    clientSecret: string,
    existingPaymentMethodId?: string
};

type Props = {
    onClose: () => void,
    onAcquirePaymentIntent: () => Promise<IntentResponse>,
    onComplete: () => Promise<void>|void
};

function PaymentMethodModalContent(props: Props) {
    const [stripe, setStripe] = useState<Stripe>();
    const [cardNumberElement, setCardNumberElement] = useState<StripeCardNumberElement | null>(null);
    const [intentResponse, setIntentResponse] = useState<IntentResponse|null>(null);
    const [error, setError] = useState<StripeError|null>(null);
    const [isLoading, setIsLoading] = useState(false);

    useEffect(
        () => {
            async function effect() {
                setIsLoading(true);

                try {
                    const intentResponse = await props.onAcquirePaymentIntent();
                    if(!intentResponse.clientSecret)
                        throw new Error("No intent secret was found.");

                    setIntentResponse(intentResponse);
                } finally {
                    setIsLoading(false);
                }
            }

            effect();
        },
        []);

    const onCreditCardReady = async () => {
        if(!intentResponse)
            return;

        setError(null);
        setIsLoading(true);

        try {
            const confirmationResponse = await stripe?.confirmCardPayment(
                intentResponse.clientSecret,
                {
                    payment_method: 
                        intentResponse.existingPaymentMethodId ?? 
                        { card: cardNumberElement! }
                });
            if(confirmationResponse?.error)
                return setError(confirmationResponse.error);
    
            let paymentIntent = confirmationResponse?.paymentIntent;
            if(!paymentIntent)
                throw new Error("No payment intent found.");
    
            while(paymentIntent.status === "processing") {
                await delay(1000);

                var result = await stripe?.retrievePaymentIntent(intentResponse.clientSecret);
                if(!result)
                    continue;
    
                if(result.error)
                    return setError(result.error);
    
                paymentIntent = result.paymentIntent;
            }
    
            if(paymentIntent.status !== "succeeded")
                throw new Error("Did not expect payment intent status: " + paymentIntent.status);
    
            await delay(5000);
            await Promise.resolve(props.onComplete());
    
            props.onClose();
        } finally {
            setIsLoading(false);
        }
    }

    const onCancelClicked = () => {
        props.onClose();
    };

    const isReady = !!intentResponse && !isLoading;

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
            {error && !isLoading && 
                <Box>
                    <FormHelperText error>
                        {error.message}
                    </FormHelperText>
                </Box>}
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
                disabled={isLoading}
            >
                Cancel
            </Button>
            <Button 
                onClick={onCreditCardReady}
                variant="contained"
                disabled={!isReady || isLoading}
            >
                Submit
            </Button>
        </DialogActions>
    </Dialog>;
}

export function PaymentMethodModal(props: Props) {
    return <LoginDialog>
        {() => <PaymentMethodModalContent {...props} />}
    </LoginDialog>;
}