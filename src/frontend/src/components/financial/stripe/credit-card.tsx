import { Grid } from "@material-ui/core";
import { CardCvcElement, CardExpiryElement, CardNumberElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { Stripe, StripeCardNumberElement, StripeElementChangeEvent, StripeElements, StripeElementType } from "@stripe/stripe-js";
import { useEffect, useState } from "react";
import { StripeTextField } from "./text-field";

type StatusOverview = { [key in StripeElementType]?: {
    error: string,
    complete: boolean
} };

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

    const [statuses, setStatuses] = useState<StatusOverview>({});

    const onChange = (event: StripeElementChangeEvent) => {
        if (!stripe || !elements)
            return;

        const newStatuses: StatusOverview = {
            ...statuses,
            [event.elementType]: {
                error: event.error?.message,
                complete: event.complete
            }
        };
        setStatuses(newStatuses);

        const knownElementTypes: StripeElementType[] = [
            "cardNumber",
            "cardExpiry",
            "cardCvc"
        ];

        const hasError = knownElementTypes
            .filter(key => {
                const status = newStatuses[key];
                return !status?.complete || status?.error;
            })
            .length > 0;

        props.onChanged(!hasError && event.complete ? elements.getElement(CardNumberElement) : null);
    };

    return <Grid container style={{
        width: '100%'
    }}>
        <Grid item xs={12}>
            <StripeTextField
                error={Boolean(statuses.cardNumber?.error)}
                labelErrorMessage={statuses.cardNumber?.error}
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
                error={Boolean(statuses.cardExpiry?.error)}
                labelErrorMessage={statuses.cardExpiry?.error}
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
                error={Boolean(statuses.cardCvc?.error)}
                labelErrorMessage={statuses.cardExpiry?.error}
                label="CVC"
                onChange={onChange}
                stripeElement={CardCvcElement}
                variant="outlined"
            />
        </Grid>
    </Grid>;
}