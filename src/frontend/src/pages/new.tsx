import { Avatar, Box, Button, CircularProgress, InputAdornment, Paper, TextField, Typography } from "@material-ui/core";
import React, { FormEvent, forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react"
import VerticalLinearStepper from "../components/vertical-linear-stepper"
import theme from "../theme";
import { 
  amountButton, 
  separator, 
  sponsorshipOptions, 
  summary 
} from './new.module.scss';
import { useOctokit } from "../hooks/clients";
import PaymentDetails, { PaymentDetailsContract } from '../components/stripe/payment-details';

function SponsorshipOptions(props: {
  options: number[],
  onAmountChanged: (amount: number) => void
}) {
  const [selectedOption, setSelectedOption] = useState(props.options[0] + "");
  useEffect(
    () => props.onAmountChanged(+selectedOption),
    [selectedOption]);

  return <Box className={sponsorshipOptions}>
    <Box>
      {props.options.map(option => 
        <Button 
          key={`button-${option}`}
          variant="outlined"
          disableElevation
          onClick={() => setSelectedOption(option.toString())}
          className={amountButton}
          style={{
            backgroundColor: selectedOption == option.toString() ?
              theme.palette.primary.main :
              "",
            color: selectedOption == option.toString() ?
              "white" :
              ""
          }}
        >
          ${option}
        </Button>)}
    </Box>
    <Box className={separator}>- or -</Box>
    <TextField 
      variant="outlined"
      margin="dense"
      fullWidth
      type="number"
      InputProps={{
        startAdornment: <InputAdornment position="start">$</InputAdornment>,
      }}
      value={selectedOption}
      onChange={e => setSelectedOption(e.target.value)} 
    />
    <ChargeSummary amount={+selectedOption} />
  </Box>;
}

function ChargeSummary(props: { 
  amount: number 
}) {
  const getSponsorkitFees = () => 
    props.amount * 0.01;

  const getStripeFees = () => 
    (props.amount * 0.029) + 0.30;

  return <Typography className={summary}>
    ${(props.amount + getStripeFees() + getSponsorkitFees()).toFixed(2)} will be charged monthly (including <a href="https://stripe.com/pricing" target="_blank">Stripe fee</a>)
  </Typography>
}

function SponsorDetails(props: {
  gitHubUsername: string
}) {
  // const user = useOctokit((octokit, signal) => octokit.users.getByUsername({
  //   username: props.gitHubUsername,
  //   request: {
  //     signal
  //   }
  // }));
  const user = {
    data: {
      avatar_url: "https://avatars.githubusercontent.com/u/2824010?v=4",
      name: "Mathias Lykkegaard Lorenzen",
      public_repos: 1337
    }
  };
  if(!user?.data)
    return <CircularProgress />;

  return <>
    <Paper elevation={1} style={{
      display: "flex",
      alignSelf: 'flex-start',
      margin: 32,
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



export default function NewPage() {
  const paymentDetails = useRef<PaymentDetailsContract>(null);
  const [amount, setAmount] = useState(0);

  return <Box flex="1" style={{
    display: 'flex'
  }}>
    <Paper style={{
      margin: 32,
      flexGrow: 1
    }}>
      <VerticalLinearStepper steps={[
        {
          title: 'Monthly sponsorship amount',
          component: 
            <SponsorshipOptions 
              options={[2, 5, 20, 50]}
              onAmountChanged={setAmount} />
        },
        {
          title: 'Payment details',
          component: <> 
            <PaymentDetails ref={paymentDetails} />
            <ChargeSummary amount={amount} />
          </>,
          onCompleted: async () => {
            const paymentMethod = await paymentDetails.current?.createPaymentDetails();
            console.log("outer create!", paymentMethod);
          }
        }
      ]} />
    </Paper>
    <SponsorDetails gitHubUsername="ffMathy" />
  </Box>
}
