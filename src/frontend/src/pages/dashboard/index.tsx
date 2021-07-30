import CircularProgressBar from "@components/circular-progress-bar";
import { Accordion, AccordionDetails, AccordionSummary, Box, Button, Card, CardContent, Container, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, Slide, TextField, Typography } from "@material-ui/core";
import { TransitionProps } from "@material-ui/core/transitions";
import { DoneSharp } from "@material-ui/icons";
import ExpandMoreIcon from '@material-ui/icons/ExpandMore';
import HelpOutlineIcon from '@material-ui/icons/HelpOutline';
import React, { useState } from "react";
import { AppBarTemplate } from "..";
import PrivateRoute from "../../components/login/private-route";
import { useApi } from "../../hooks/clients";
import * as classes from "./index.module.scss";

const Transition = React.forwardRef(function Transition(
    props: TransitionProps & { children?: React.ReactElement<any, any> },
    ref: React.Ref<unknown>,
) {
    return <Slide direction="up" ref={ref} {...props} />;
});

function DashboardPage() {
    const [isValidatingEmail, setIsValidatingEmail] = useState(false);

    const account = useApi(
        async client => await client.apiAccountGet(),
        []);
    if (!account)
        return null;

    return <AppBarTemplate logoVariant="sponsorkit">
        <EmailValidationDialog
            email={account.email}
            isOpen={isValidatingEmail}
            onClose={() => setIsValidatingEmail(false)} />
        <Container
            maxWidth="lg"
            className={classes.root}
        >
            <Typography variant="h2" component="h2" className={classes.profileCompletionHeader}>
                Profile
            </Typography>
            <Box className={classes.accountOverviews}>
                <AccountOverview
                    title="Profile completion"
                    subTitle="Your beneficiary details are used when you want to earn money from bounties, donations or sponsorships. Your sponsor details are used when you want to place bounties, give donations or start sponsoring others."
                    checkpoints={[
                        {
                            label: "Connect your GitHub account",
                            description: "Connecting your GitHub account is required for receiving bounties, donations, or sponsorships.",
                            validate: () => true,
                            onClick: () => { }
                        },
                        {
                            label: "Change or verify e-mail address",
                            description: "Verifying your e-mail address allows you to receive an e-mail whenever you earn money, and when your card has been charged (invoices).",
                            validate: () => account.isEmailVerified,
                            onClick: () => setIsValidatingEmail(true)
                        },
                        {
                            label: "Save payment details for later",
                            description: "Payment information is stored with Stripe. Saving it makes it easier for you to create bounties, donations or sponsor someone in the future.",
                            validate: () => !!account.sponsor?.creditCard,
                            onClick: () => { }
                        },
                        {
                            label: "Fill in your bank account details",
                            description: "Filling in your bank account and payout details with Stripe allows you to withdraw earned money to your bank account.",
                            validate: () => !!account.beneficiary,
                            onClick: () => { }
                        }
                    ]}
                />
            </Box>
        </Container>
    </AppBarTemplate>;
}

function EmailValidationDialog(props: {
    email: string,
    isOpen: boolean,
    onClose: () => void
}) {
    const [email, setEmail] = useState(() => props.email);

    const onVerifyClicked = () => {

    };

    return <Dialog
        open={props.isOpen}
        onClose={props.onClose}
        TransitionComponent={Transition}
    >
        <DialogTitle>Is this your e-mail?</DialogTitle>
        <DialogContent className={classes.verifyEmailDialog}>
            <Typography>
                Make sure your e-mail is correct. We'll send you an e-mail with a verification link.
            </Typography>
            <TextField
                label="E-mail"
                variant="outlined"
                autoFocus
                className={classes.textBox}
                value={email}
                onChange={e => setEmail(e.target.value)} />
        </DialogContent>
        <DialogActions>
            <Button
                onClick={props.onClose}
                color="secondary"
            >
                Cancel
            </Button>
            <Button
                onClick={onVerifyClicked}
                variant="contained"
            >
                Verify
            </Button>
        </DialogActions>
    </Dialog>
}

type CheckpointProps = {
    validate: () => boolean,
    label: string,
    description: string,
    onClick?: () => void
};

function AccountOverview(props: {
    title: string,
    subTitle: string,
    checkpoints: Array<CheckpointProps>
}) {
    const totalCheckpointCount = props.checkpoints.length;
    const validatedCheckpointCount = props.checkpoints
        .filter(x => x.validate())
        .length;
    const firstNonValidatedCheckpointIndex = props.checkpoints.findIndex(x => !x.validate());
    return <Card className={classes.accountOverview}>
        <CardContent className={classes.content}>
            <Box className={classes.header}>
                <Box className={classes.text}>
                    <Typography variant="h5" component="h2">
                        {props.title}
                    </Typography>
                    <Typography variant="body2" component="p">
                        {props.subTitle}
                    </Typography>
                </Box>
                <CircularProgressBar
                    size={110}
                    current={validatedCheckpointCount}
                    maximum={totalCheckpointCount}
                    text={`${validatedCheckpointCount} / ${totalCheckpointCount}`}
                />
            </Box>
            <Box className={classes.accordions}>
                {props.checkpoints.map((x, i) =>
                    <Accordion className={classes.accordion} defaultExpanded={i === firstNonValidatedCheckpointIndex}>
                        <AccordionSummary className={classes.accordionSummary} expandIcon={<ExpandMoreIcon />}>
                            <FormControlLabel
                                classes={{
                                    label: classes.header
                                }}
                                control={x.validate() ?
                                    <DoneSharp
                                        className={classes.checkbox}
                                        color="primary" /> :
                                    <HelpOutlineIcon
                                        className={classes.checkbox}
                                        color="disabled" />}
                                label={x.label}
                            />
                        </AccordionSummary>
                        <AccordionDetails className={classes.accordionDetails}>
                            <Typography className={classes.description} color="textSecondary">
                                {x.description}
                            </Typography>
                            {!x.validate() &&
                                <Button 
                                    className={classes.completeButton} 
                                    variant="contained"
                                    onClick={x.onClick}
                                >
                                    Begin
                                </Button>}
                        </AccordionDetails>
                    </Accordion>)}
            </Box>
        </CardContent>
    </Card>
}

export default function () {
    return <PrivateRoute
        component={DashboardPage}
        path="/dashboard" />
}