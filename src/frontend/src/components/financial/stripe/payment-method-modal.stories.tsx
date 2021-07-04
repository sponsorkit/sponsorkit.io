import { Button } from "@material-ui/core";
import { useEffect, useState } from "react";

import { Story, Meta } from '@storybook/react';
import { PaymentMethodModal } from "./payment-modal";

export default {
    component: PaymentMethodModal,
    title: 'components/login/login-dialog',
} as Meta;

type Props = {}

const Template: Story<Props> = (args) => {
    const [shouldAddPaymentMethod, setShouldAddPaymentMethod] = useState(false);

    if(!shouldAddPaymentMethod) {
        return <Button variant="contained" onClick={() => setShouldAddPaymentMethod(true)}>
            Add payment method
        </Button>
    }
    
    return (
        <PaymentMethodModal 
            onClose={() => setShouldAddPaymentMethod(false)}
            onComplete={() => alert("payment method added!")}
            onAcquirePaymentIntent={async () => ({
                clientSecret: "dummy",
                existingPaymentMethodId: "dummy"
            })}
        />
    )
};

export const Minimal = Template.bind({});

Minimal.args = {
};