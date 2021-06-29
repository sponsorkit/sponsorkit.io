import { Button } from "@material-ui/core";
import { useEffect, useState } from "react";
import {PaymentMethodModal} from "../../components/financial/stripe/payment-modal";

export default () => {
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