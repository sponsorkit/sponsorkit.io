import { Button, Card, CardActions, CardContent, Typography } from "@material-ui/core";
import { AppBarTemplate } from "..";
import * as classes from "./verification-success.module.scss";

export default () => {
    return <AppBarTemplate logoVariant="sponsorkit">
        <VerificationSuccessPage />
    </AppBarTemplate>
}

export function VerificationSuccessPage() {
    return <Card>
        <CardContent>
            <Typography>
                Your e-mail has been verified!
            </Typography>
        </CardContent>
        <CardActions className={classes.cardActions}>
            <Button 
                variant="contained" 
                color="primary"
                onClick={() => {
                    window.location.href = "/dashboard";
                }}
            >
                Sign in
            </Button>
        </CardActions>
    </Card>
}