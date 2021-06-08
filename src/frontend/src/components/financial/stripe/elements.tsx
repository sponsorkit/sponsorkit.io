import React, { PropsWithChildren } from 'react';

import { loadStripe } from "@stripe/stripe-js";

const stripePromise = loadStripe('pk_test_51IWkhfBGc8xbeDA0hIEM0ZyOJfsyGufhwCLzem0YluDpXFLgR2WuHx7priPX5DWKCyvikRTPRgKn7Cf05vZbHuDD00BceWadyX');

import { Elements as StripeElements } from "@stripe/react-stripe-js";

export default function Elements(props: PropsWithChildren<{}>) {
    return <StripeElements options={{ locale: 'en' }} stripe={stripePromise}>
        {props.children}
    </StripeElements>;
}