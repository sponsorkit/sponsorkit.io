import { Grid } from "@material-ui/core";
import { CardCvcElement, CardExpiryElement, CardNumberElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { Stripe, StripeCardNumberElement, StripeElementChangeEvent, StripeElements, StripeElementType } from "@stripe/stripe-js";
import { useEffect, useState } from "react";
import { StripeTextField } from "./text-field";


export default function StripeCreditCard(props: {
    onInitialized: (context: { stripe: Stripe, elements: StripeElements }) => void,
    onChanged: (cardNumberElement: StripeCardNumberElement|null) => void
}) {
    const stripe = useStripe();
    const elements = useElements();
    useEffect(
        () => {
            if(!stripe || !elements)
                return;

            props.onInitialized({ 
                stripe, 
                elements 
            });
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

        const cardNumberElement = elements.getElement(CardNumberElement);
        props.onChanged(cardNumberElement);
    };

    return <Grid container style={{
        width: '100%'
    }}>
        <Grid item xs={12}>
            <StripeTextField
                error={Boolean(errors.cardNumber)}
                labelErrorMessage={errors.cardNumber}
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
                labelErrorMessage={errors.cardExpiry}
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
                labelErrorMessage={errors.cardExpiry}
                label="CVC"
                onChange={onChange}
                stripeElement={CardCvcElement}
                variant="outlined"
            />
        </Grid>
    </Grid>;
}