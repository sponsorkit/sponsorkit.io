import { FormControl, Grid, Input, InputLabel } from "@material-ui/core";
import { CardCvcElement, CardElement, CardExpiryElement, CardNumberElement, Elements, useElements, useStripe } from "@stripe/react-stripe-js";
import { loadStripe, PaymentMethod } from "@stripe/stripe-js";
import React, { useState } from "react";
import { ForwardedRef, forwardRef, useEffect, useImperativeHandle } from "react";
import ElementWrapper from "./element-wrapper";

const stripePromise = loadStripe('pk_test_51IWkhfBGc8xbeDA0hIEM0ZyOJfsyGufhwCLzem0YluDpXFLgR2WuHx7priPX5DWKCyvikRTPRgKn7Cf05vZbHuDD00BceWadyX');

export type StripeCreditCardContract = {
    createPaymentDetails(): Promise<PaymentMethod | null>;
}

export default forwardRef<StripeCreditCardContract, {}>(function (
    _,
    ref
) {
    return <Elements stripe={stripePromise}>
        <div style={{
            width: 300
        }}>
            <StripeCreditCardInner ref={ref} />
        </div>
    </Elements>
});

const StripeCreditCardInner = forwardRef<StripeCreditCardContract, {}>(function (
    _,
    ref) {
    const stripe = useStripe();
    const elements = useElements();

    useImperativeHandle(ref, () => ({
        async createPaymentDetails() {
            console.log("on-submit");

            if (!stripe || !elements)
                return null;

            const cardElement = elements.getElement(CardElement);
            if (!cardElement)
                return null;

            const { error, paymentMethod } = await stripe.createPaymentMethod({
                type: 'card',
                card: cardElement,
            });

            if (error) {
                console.log('[error]', error);
            } else {
                console.log('[PaymentMethod]', paymentMethod);
            }

            return paymentMethod || null;
        }
    }));

    return <>
        <Grid container>
            <Grid item xs={12}>
                <ElementWrapper label="Card Number" component={CardNumberElement as any} />
            </Grid>
            <Grid item xs={7}>
                <ElementWrapper label="Expiry (MM / YY)" component={CardExpiryElement as any} />
            </Grid>
            <Grid item xs={5}>
                <ElementWrapper label="CVC" component={CardCvcElement as any} />
            </Grid>
        </Grid>
    </>;
});