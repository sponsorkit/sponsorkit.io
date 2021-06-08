import { Avatar, Box, CircularProgress, Container, Paper, TextField, Typography } from "@material-ui/core";
import React, { useEffect, useMemo, useState } from "react"
import VerticalLinearStepper from "../components/vertical-linear-stepper"
import StripeCreditCard from '../components/financial/stripe/credit-card';
import { Stripe, StripeCardNumberElement } from "@stripe/stripe-js";
import Elements from "../components/financial/stripe/elements";
import { useOctokit } from "../hooks/clients";
import { AmountPicker } from "../components/financial/amount-picker";
import { FeeDisplay } from "../components/financial/fee-display";

function SponsorDetails(props: {
  gitHubUsername: string
}) {
  const user = useOctokit(
    (octokit, signal) => octokit.users.getByUsername({
      username: props.gitHubUsername,
      request: {
        signal
      }
    }),
    []);
  if(!user?.data)
    return <CircularProgress />;

  return <>
    <Paper elevation={1} style={{
      display: "flex",
      alignSelf: 'flex-start',
      margin: 32,
      marginLeft: 0,
      padding: 16
    }}>
      <Avatar 
        src={user.data.avatar_url} 
        style={{
          width: 64,
          height: 64,
          margin: 8
        }} />
      <Box style={{
        display: "flex",
        flexDirection: "column",
        margin: 8,
        alignSelf: 'center'
      }}>
        <Typography style={{ fontSize: 20 }}>{user.data.name}</Typography>
        <Typography style={{ fontSize: 14 }}>~{user.data.public_repos} open-source projects</Typography>
      </Box>
    </Paper>
  </>;
}

export type PaymentDetails = {
  stripe: Stripe|undefined,
  cardNumberElement: StripeCardNumberElement|null,
  email: string|undefined
};

function PaymentDetails(props: {
  amount: number,
  onChange: (details: PaymentDetails) => void
}) {
  const [stripe, setStripe] = useState<Stripe>();
  const [cardNumberElement, setCardNumberElement] = useState<StripeCardNumberElement|null>(null);

  const [email, setEmail] = useState<string|undefined>(undefined);
  const emailError = useMemo(
    () => {
      if(email === undefined)
        return null;

      if(!email)
        return "Your e-mail address is imcomplete.";

      if(email.indexOf('@') === -1 || email.indexOf('.') === -1)
        return "Your e-mail address doesn't look correct.";

      return null;
    },
    [email]);

  useEffect(
    () => {
      props.onChange({
        cardNumberElement,
        email,
        stripe
      });
    },
    [cardNumberElement, email, stripe]);

  return <>
    <TextField 
      label="E-mail address"
      variant="outlined"
      margin="dense"
      fullWidth
      type="email"
      value={email}
      error={!!emailError}
      helperText={emailError}
      onChange={e => setEmail(e.target.value)} 
    />
    <StripeCreditCard 
      onInitialized={context => setStripe(context.stripe)} 
      onChanged={setCardNumberElement}
    />
    <FeeDisplay amount={props.amount} />
  </>
}

export default function NewPage() {
  const [amount, setAmount] = useState(0);
  const [paymentDetails, setPaymentDetails] = useState<PaymentDetails>();

  return <Container maxWidth="md" style={{
    display: 'flex'
  }}>
    <Paper style={{
      margin: 32,
      flexGrow: 1
    }}>
      <VerticalLinearStepper 
        steps={[
          {
            title: 'Monthly sponsorship amount',
            component: <AmountPicker 
                options={[5, 20, 50, 100]}
                onAmountChanged={setAmount} />
          },
          {
            title: 'Payment details',
            component: 
              <Elements>
                <PaymentDetails 
                  amount={amount}
                  onChange={setPaymentDetails} 
                />
              </Elements>,
            onCompleted: async () => {
              //TODO: use payment-method-modal.tsx
            }
          }
        ]} 
      />
    </Paper>
    <SponsorDetails gitHubUsername="ffMathy" />
  </Container>
}
