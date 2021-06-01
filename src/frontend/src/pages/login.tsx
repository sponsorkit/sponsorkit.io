import { Button, Container, Paper } from "@material-ui/core";
import React, { useState } from "react"
import { apiClient } from "../api";
import LoginDialog from "../components/login-dialog";

export default function LoginPage(props: {
  redirectTo?: string
}) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  return <Container maxWidth="md" style={{
    display: 'flex'
  }}>
    <Paper style={{
      margin: 32,
      flexGrow: 1
    }}>
      <h1>Sign up{props.redirectTo && " to continue"}</h1>
      <p>Sponsorkit helps open-source developers get paid for their precious work.</p>

      <Button onClick={() => setIsDialogOpen(true)}>
        Sign in with GitHub
      </Button>

      <LoginDialog 
        open={isDialogOpen}
        onCodeAcquired={async code => {
          setIsDialogOpen(false);

          const response = await apiClient.apiSignupFromGithubPost({
            body: {
              gitHubAuthenticationCode: code
            }
          });
          localStorage.setItem("token", response.token ?? "");
        }} />
    </Paper>
  </Container>
}
