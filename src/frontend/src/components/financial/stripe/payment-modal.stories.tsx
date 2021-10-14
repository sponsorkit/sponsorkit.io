import { useConfiguration } from "@hooks/configuration";
import { Button, CircularProgress } from "@mui/material";
import { Meta, Story } from '@storybook/react';
import { useState } from "react";
import { PaymentMethodModal } from "./payment-modal";


export default {
    component: PaymentMethodModal,
    title: 'components/financial/stripe/payment-modal',
} as Meta;

type Props = {}

const Template: Story<Props> = (args) => {
    const [shouldAddPaymentMethod, setShouldAddPaymentMethod] = useState(false);
    const configuration = useConfiguration();
    if(!configuration)
        return <CircularProgress />;
    
    return <>
        <Button variant="contained" onClick={() => setShouldAddPaymentMethod(true)}>
            Add payment method
        </Button> :
        <PaymentMethodModal 
            configuration={configuration}
            isOpen={shouldAddPaymentMethod}
            onClose={() => setShouldAddPaymentMethod(false)}
            onComplete={() => alert("payment method added!")}
            onAcquirePaymentIntent={async () => ({
                clientSecret: "dummy",
                existingPaymentMethodId: "dummy"
            })}
        />
    </>;
};

export const Minimal = Template.bind({});

Minimal.args = {
};