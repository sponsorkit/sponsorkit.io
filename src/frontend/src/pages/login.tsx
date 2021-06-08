import { Button, Container, Paper } from "@material-ui/core";
import React, { useState } from "react";
import LoginDialog from "../components/login/login-dialog";
import { useToken } from "../hooks/token";
import { useLocation, useParams } from "@reach/router";

export default function LoginPage() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [token] = useToken();
  const location = useLocation();
  const params = useParams();

  const redirectTo = params?.redirectTo;

  const onLogin = () => {
    location.href = redirectTo ?? "/";
  };

  if(token) {
    onLogin();
    return null;
  }

  return <Container maxWidth="md" style={{
    display: 'flex'
  }}>
    <Paper style={{
      margin: 32,
      flexGrow: 1
    }}>
      <h1>Sign up{redirectTo && " to continue"}</h1>
      <p>Sponsorkit helps open-source developers get paid for their precious work.</p>

      <Button onClick={() => setIsDialogOpen(true)}>
        Sign in with GitHub
      </Button>

      <LoginDialog 
        open={isDialogOpen}
        onLoggedIn={async () => {
          setIsDialogOpen(false);
          onLogin();
        }} />
    </Paper>
  </Container>
}
