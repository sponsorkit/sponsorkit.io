import { Card, CardContent, Typography } from "@material-ui/core";
import { AppBarTemplate } from "..";

export default function VerificationSuccessPage() {
    return <AppBarTemplate logoVariant="sponsorkit">
        <Card>
            <CardContent>
                <Typography>
                    Your e-mail has been verified!
                </Typography>
            </CardContent>
        </Card>
    </AppBarTemplate>
}