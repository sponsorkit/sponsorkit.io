import CircularProgressBar from "@components/circular-progress-bar";
import { Box, Button, Card, CardContent, Container, Paper, Typography } from "@material-ui/core";
import { CheckBox, CheckBoxOutlineBlank, QuestionAnswer } from "@material-ui/icons";
import { AppBarTemplate } from "..";
import PrivateRoute from "../../components/login/private-route";
import { createApi, useApi } from "../../hooks/clients";
import * as classes from "./index.module.scss";

function DashboardPage() {
    const account = useApi(
        async client => await client.apiAccountGet(),
        []);
    if (!account)
        return null;

    return <AppBarTemplate logoVariant="sponsorkit">
        <Container
            maxWidth="md"
            className={classes.root}
        >
            <Typography variant="h2" component="h2">
                Profile completion
            </Typography>
            <AccountOverview
                title="Beneficiary"
                subTitle="Your beneficiary profile is used when you want to earn money from bounties, donations or sponsorships."
                checkpoints={[
                    {
                        label: "Connect your GitHub account",
                        validate: () => true
                    },
                    {
                        label: "Verify e-mail address",
                        validate: () => account.isEmailVerified,
                        onClick: () => { }
                    },
                    {
                        label: "Complete Stripe profile",
                        validate: () => account.isEmailVerified,
                        onClick: () => { }
                    }
                ]}
            />
            <AccountOverview
                title="Sponsor"
                subTitle="Your sponsor profile is used when you want to place bounties, give donations or start sponsoring others."
                checkpoints={[
                    {
                        label: "Connect your GitHub account",
                        validate: () => true
                    },
                    {
                        label: "Verify e-mail address",
                        validate: () => account.isEmailVerified,
                        onClick: () => { }
                    },
                    {
                        label: "Save payment details for later",
                        validate: () => !!account.sponsor?.creditCard,
                        onClick: () => { }
                    }
                ]}
            />
        </Container>
    </AppBarTemplate>;
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
    return <Card className={classes.accountOverview}>
        <CardContent className={classes.content}>
            <Typography variant="h5" component="h2">
                {props.title}
            </Typography>
            <Typography variant="body2" component="p">
                {props.subTitle}
            </Typography>
            <Box className={classes.progress}>
                <CircularProgressBar
                    size={100}
                    current={validatedCheckpointCount}
                    maximum={totalCheckpointCount}
                />
                <Box>
                    <ul>
                        {props.checkpoints.map(x =>
                            <li>
                                {x.validate() ?
                                    <CheckBox color="primary" /> :
                                    <CheckBoxOutlineBlank color="disabled" />}
                                <Typography className={classes.typography}>
                                    {x.label}
                                </Typography>
                            </li>)}
                    </ul>
                </Box>
            </Box>
        </CardContent>
    </Card>
}

export default function () {
    return <PrivateRoute
        component={DashboardPage}
        path="/dashboard" />
}