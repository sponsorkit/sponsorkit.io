import { CardElement, Elements, useElements, useStripe } from "@stripe/react-stripe-js";
import { loadStripe, PaymentMethod } from "@stripe/stripe-js";
import React from "react";
import { ForwardedRef, forwardRef, useEffect, useImperativeHandle } from "react";

const stripePromise = loadStripe('pk_test_51IWkhfBGc8xbeDA0hIEM0ZyOJfsyGufhwCLzem0YluDpXFLgR2WuHx7priPX5DWKCyvikRTPRgKn7Cf05vZbHuDD00BceWadyX');

export type PaymentDetailsContract = {
    createPaymentDetails(): Promise<PaymentMethod|null>;
}

export default forwardRef<PaymentDetailsContract, {}>(function(
    _,
    ref
) {
    return <Elements stripe={stripePromise}>
        <div style={{
            width: 300
        }}>
            <PaymentDetailsInner ref={ref} />
        </div>
    </Elements>
});

const PaymentDetailsInner = forwardRef<PaymentDetailsContract, {}>(function (
    _, 
    ref) 
{  
    const stripe = useStripe();
    const elements = useElements();

    useImperativeHandle(ref, () => ({
        async createPaymentDetails() {
            console.log("on-submit");

            if (!stripe || !elements)
                return null;
        
            const cardElement = elements.getElement(CardElement);
            if(!cardElement)
                return null;
        
            const {error, paymentMethod} = await stripe.createPaymentMethod({
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

    return <CardElement />;
});