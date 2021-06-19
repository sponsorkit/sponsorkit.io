import { Elements as StripeElements } from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import React, { PropsWithChildren } from 'react';


const stripePromise = loadStripe('pk_test_51IWkhfBGc8xbeDA0hIEM0ZyOJfsyGufhwCLzem0YluDpXFLgR2WuHx7priPX5DWKCyvikRTPRgKn7Cf05vZbHuDD00BceWadyX');


export default function Elements(props: PropsWithChildren<{}>) {
    return <StripeElements options={{ locale: 'en' }} stripe={stripePromise}>
        {props.children}
    </StripeElements>;
}