import CircularProgressBar from "@components/circular-progress-bar";
import { Box, Button, Card, CardContent, Container, Paper } from "@material-ui/core";
import PrivateRoute from "../../components/login/private-route";
import { createApi, useApi } from "../../hooks/clients";
import * as classes from "./index.module.scss";

function DashboardPage() {
    const account = useApi(
        async client => await client.apiAccountGet(),
        []);
    if(!account)
        return null;

    return <Container 
        maxWidth="md" 
        style={{
            display: 'flex'
        }}
    >
        <AccountOverview
            title="Beneficiary profile"
            subTitle="Used when you want to earn money from bounties, donations or sponsorships."
            checkpoints={[
                {
                    label: "Connect your GitHub account",
                    validate: () => true
                },
                {
                    label: "Verify e-mail address",
                    validate: () => account.isEmailVerified,
                    onClick: () => {}
                },
                {
                    label: "Complete Stripe profile",
                    validate: () => account.isEmailVerified,
                    onClick: () => {}
                }
            ]}
        />
        <AccountOverview
            title="Sponsor profile"
            subTitle="Used when you want to place bounties, give donations or start sponsoring others."
            checkpoints={[
                {
                    label: "Connect your GitHub account",
                    validate: () => true
                },
                {
                    label: "Verify e-mail address",
                    validate: () => account.isEmailVerified,
                    onClick: () => {}
                },
                {
                    label: "Save payment details for later",
                    validate: () => !!account.sponsor?.creditCard,
                    onClick: () => {}
                }
            ]}
        />
    </Container>;
}

function AccountOverview(props: {
    title: string,
    subTitle: string,
    checkpoints: Array<{
        validate: () => boolean,
        label: string,
        onClick?: () => void
    }>
}) {
    const totalCheckpointCount = props.checkpoints.length;
    const validatedCheckpointCount = props.checkpoints
        .filter(x => x.validate())
        .length;
    return <Card>
        <CardContent className={classes.accountOverview}>
            <Box>
                <CircularProgressBar
                    size={100}
                    current={validatedCheckpointCount}
                    maximum={totalCheckpointCount}
                />
            </Box>
        </CardContent>
    </Card>
}

export default function() {
    return <PrivateRoute 
        component={DashboardPage} 
        path="/dashboard" />
}