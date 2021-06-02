import { Button, Container, Paper } from "@material-ui/core";
import { Stripe, StripeCardNumberElement } from "@stripe/stripe-js";
import React, { useState } from "react";
import PrivateRoute from "../../components/login/private-route";
import StripeCreditCard from "../../components/stripe/credit-card";
import { useApi } from "../../hooks/clients";

function DashboardPage() {
    const account = useApi(async client => await client.apiAccountGet());
    if(!account)
        return null;

    return <Container maxWidth="md" style={{
        display: 'flex'
      }}>
        <Paper style={{
          margin: 32,
          flexGrow: 1
        }}>
            <BeneficiarySection isSetup={!!account.beneficiary} />
            <SponsorSection isSetup={!!account.sponsor} />
        </Paper>
    </Container>;
}

function BeneficiarySection(props: {
    isSetup: boolean
}) {
    if(props.isSetup)
        return <p>Your beneficiary account has already been set up</p>;

    return <></>
}

function SponsorSection(props: {
    isSetup: boolean
}) {
    const [cardNumberElement, setCardNumberElement] = useState<StripeCardNumberElement|null>(null);
    const [stripe, setStripe] = useState<Stripe>();
    
    if(props.isSetup)
        return <p>Your sponsor account has already been set up</p>;

    const onSaveClicked = async () => {
        if(!stripe || !cardNumberElement)
            throw new Error("Stripe or payment method not fully set.");

        const paymentMethodResponse = await stripe.createPaymentMethod({
          card: cardNumberElement,
          type: "card"
        });
        if(paymentMethodResponse.error)
          return alert(paymentMethodResponse.error.message);
          
        
    };

    return <>
        <StripeCreditCard 
            onInitialized={context => setStripe(context.stripe)} 
            onChanged={setCardNumberElement}
        />
        <Button 
            disabled={!stripe || !cardNumberElement} 
            onClick={onSaveClicked}
        >
            Save
        </Button>
    </>
}

export default function() {
    return <PrivateRoute 
        component={DashboardPage} 
        path="/dashboard" />
}