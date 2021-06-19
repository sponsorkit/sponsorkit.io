import { Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Slide } from "@material-ui/core";
import { TransitionProps } from "@material-ui/core/transitions/transition";
import { Stripe, StripeCardNumberElement } from "@stripe/stripe-js";
import React, { useEffect, useState } from "react";
import LoginDialog from "../../login/login-dialog";
import { GeneralApiAccountPaymentMethodIntentGetResponse } from "../../../api/openapi/src";
import { createApi, useApi } from "../../../hooks/clients";
import StripeCreditCard from "./credit-card";
import Elements from "./elements";

const Transition = React.forwardRef(function Transition(
    props: TransitionProps & { children?: React.ReactElement<any, any> },
    ref: React.Ref<unknown>,
) {
    return <Slide direction="up" ref={ref} {...props} />;
});

export function PaymentMethodModal(props: {
    children: () => Promise<void> | void
}) {
    const [stripe, setStripe] = useState<Stripe>();
    const [cardNumberElement, setCardNumberElement] = useState<StripeCardNumberElement | null>(null);
    const [intentResponse, setIntentResponse] = useState<GeneralApiAccountPaymentMethodIntentGetResponse|null>(null);

    const [isOpen, setIsOpen] = useState(true);
    const [isReady, setIsReady] = useState(false);

    const onCancelClicked = () => setIsOpen(false);
    const onSubmitClicked = async () => {
        if(!isReady)
            return;

        setIsOpen(false);
        
        try {
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
        } catch {
            setIsOpen(true);
        }
    }

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

    return <LoginDialog>
        {() => <Dialog open={isOpen} TransitionComponent={Transition}>
            {!isReady ?
                <CircularProgress /> : 
                <>
                    <DialogTitle>Enter payment details</DialogTitle>
                    <DialogContent>
                        <Elements>
                            <StripeCreditCard
                                onInitialized={context => setStripe(context.stripe)}
                                onChanged={setCardNumberElement}
                            />
                        </Elements>
                    </DialogContent>
                    <DialogActions>
                        <Button 
                            onClick={onCancelClicked}
                            color="secondary"
                        >
                            Cancel
                        </Button>
                        <Button 
                            onClick={onSubmitClicked}
                            color="primary"
                        >
                            Submit
                        </Button>
                    </DialogActions>
                </>}
        </Dialog>}
    </LoginDialog>;
}