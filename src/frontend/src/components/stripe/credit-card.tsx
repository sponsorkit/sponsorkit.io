import { Grid } from "@material-ui/core";
import { CardCvcElement, CardExpiryElement, CardNumberElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { StripeElementChangeEvent, StripeElements, StripeElementType } from "@stripe/stripe-js";
import { Stripe } from "@stripe/stripe-js";
import React, { useState } from "react";
import { useEffect } from "react";

import { StripeTextField } from "./text-field";

export type CreditCardInitializedCallback = (context: { stripe: Stripe, elements: StripeElements }) => void;

export default function (props: {
    onInitialized: CreditCardInitializedCallback
}) {
    const stripe = useStripe();
    const elements = useElements();
    useEffect(
        () => {
            stripe && elements && props.onInitialized({ stripe, elements });
        },
        [stripe, elements]);

    const [errors, setErrors] = useState<{ [key in StripeElementType]?: string }>({});

    const onChange = (event: StripeElementChangeEvent) => {
        if (!stripe || !elements)
            return;

        setErrors({
            ...errors,
            [event.elementType]: event.error?.message
        });

        const cardElement = elements.getElement(CardNumberElement);
        console.log("card", cardElement);
    };

    return <Grid container style={{
        width: '100%'
    }}>
        <Grid item xs={12}>
            <StripeTextField
                error={Boolean(errors.cardNumber)}
                helperText={errors.cardNumber}
                label="Card number"
                inputProps={{
                    options: {
                        showIcon: true
                    }
                }}
                onChange={onChange}
                stripeElement={CardNumberElement}
                variant="outlined"
            />
        </Grid>
        <Grid item xs={7}>
            <StripeTextField
                error={Boolean(errors.cardExpiry)}
                helperText={errors.cardExpiry}
                label="Expiry"
                onChange={onChange}
                stripeElement={CardExpiryElement}
                variant="outlined"
            />
        </Grid>
        <Grid item xs={5} style={{
            paddingLeft: 18
        }}>
            <StripeTextField
                error={Boolean(errors.cardCvc)}
                helperText={errors.cardCvc}
                label="CVC"
                onChange={onChange}
                stripeElement={CardCvcElement}
                variant="outlined"
            />
        </Grid>
    </Grid>;
}