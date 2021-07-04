import { Button } from "@material-ui/core";
import { useEffect, useState } from "react";

import { Story, Meta } from '@storybook/react';
import { PaymentMethodModal } from "./payment-modal";
import ThemeConfig from "@theme";

export default {
    component: PaymentMethodModal,
    title: 'components/financial/stripe/payment-modal',
} as Meta;

type Props = {}

const Template: Story<Props> = (args) => {
    const [shouldAddPaymentMethod, setShouldAddPaymentMethod] = useState(false);
    
    return !shouldAddPaymentMethod ?
        <Button variant="contained" onClick={() => setShouldAddPaymentMethod(true)}>
            Add payment method
        </Button> :
        <PaymentMethodModal 
            onClose={() => setShouldAddPaymentMethod(false)}
            onComplete={() => alert("payment method added!")}
            onAcquirePaymentIntent={async () => ({
                clientSecret: "dummy",
                existingPaymentMethodId: "dummy"
            })}
        />;
};

export const Minimal = Template.bind({});

Minimal.args = {
};