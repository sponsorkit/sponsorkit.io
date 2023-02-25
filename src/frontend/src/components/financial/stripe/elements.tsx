import { CircularProgress } from "@mui/material";
import { Elements as StripeElements } from "@stripe/react-stripe-js";
import { loadStripe, Stripe } from "@stripe/stripe-js";
import { PropsWithChildren, useEffect, useState } from 'react';
import { useConfiguration } from "../../../hooks/configuration";

export default function Elements(props: PropsWithChildren<{}>) {
    const [stripe, setStripe] = useState<Stripe|undefined>();
    const configuration = useConfiguration();

    useEffect(
        () => {
            async function effect() {
                if(!configuration)
                    return;

                const loadedStripe = await loadStripe(configuration.stripeClientId);                
                if(!loadedStripe)
                    throw new Error("Could not load Stripe.");
                
                setStripe(loadedStripe);
            }

            effect();
        },
        [configuration]);

    if(!stripe)
        return <CircularProgress />;

    return <StripeElements options={{ locale: 'en' }} stripe={stripe}>
        {props.children}
    </StripeElements>;
}