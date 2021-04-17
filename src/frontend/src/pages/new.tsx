import { Avatar, Box, Button, CircularProgress, Paper, TextField, Typography } from "@material-ui/core";
import React, { useState } from "react"
import VerticalLinearStepper from "../components/vertical-linear-stepper"
import { useOctokit } from "../hooks/clients";

function renderSponsorshipAmount() {
  return <>
    <SponsorshipOptions options={[2, 5, 20, 50]} />
  </>
}

function renderPaymentInformation() {
  return <>
  </>
}

function SponsorshipOptions(props: {
  options: number[]
}) {
  const [selectedOption, setSelectedOption] = useState(props.options[0]);

  return <>
    <Box>
      {props.options.map(option => <>
        <Button 
          variant="outlined"
          onClick={() => setSelectedOption(option)}
          style={{
            margin: 6,
            // borderColor: selectedOption === option ?
              
          }}
        >
          ${option}
        </Button>
      </>)}
    </Box>
    <TextField />
  </>;
}

function SponsorDetails(props: {
  gitHubUsername: string
}) {
  const user = useOctokit((octokit, signal) => octokit.users.getByUsername({
    username: props.gitHubUsername,
    request: {
      signal
    }
  }));
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
  return <Box flex="1" style={{
    display: 'flex'
  }}>
    <Paper style={{
      margin: 32,
      flexGrow: 1
    }}>
      <VerticalLinearStepper steps={[
        {
          title: 'Sponsorship amount',
          render: () => renderSponsorshipAmount()
        },
        {
          title: 'Payment details',
          render: () => renderPaymentInformation()
        }
      ]} />
    </Paper>
    <SponsorDetails gitHubUsername="ffMathy" />
  </Box>
}
