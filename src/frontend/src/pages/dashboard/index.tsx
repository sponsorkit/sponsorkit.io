import { AsynchronousProgressDialog } from "@components/asynchronous-progress-dialog";
import CircularProgressBar from "@components/circular-progress-bar";
import { Accordion, AccordionDetails, AccordionSummary, Box, Button, Card, CardContent, Container, DialogContent, DialogTitle, FormControlLabel, TextField, Typography } from "@material-ui/core";
import { DoneSharp } from "@material-ui/icons";
import ExpandMoreIcon from '@material-ui/icons/ExpandMore';
import HelpOutlineIcon from '@material-ui/icons/HelpOutline';
import { isPopupBlocked } from "@utils/popup";
import React, { useState } from "react";
import { AppBarTemplate } from "..";
import PrivateRoute from "../../components/login/private-route";
import { createApi, useApi } from "../../hooks/clients";
import * as classes from "./index.module.scss";

function DashboardPage() {
    const [isValidatingEmail, setIsValidatingEmail] = useState(false);
    const [isFillingInBankDetails, setIsFillingInBankDetails] = useState(false);
    const [lastProgressChange, setLastProgressChange] = useState(new Date());

    const account = useApi(
        async client => await client.accountGet(),
        [lastProgressChange]);
    if (!account)
        return null;

    return <AppBarTemplate logoVariant="sponsorkit">
        <EmailValidationDialog
            email={account.email}
            isOpen={isValidatingEmail}
            onValidated={() => setLastProgressChange(new Date())}
            onClose={() => setIsValidatingEmail(false)} />
        <BankDetailsDialog
            isOpen={isFillingInBankDetails}
            onValidated={() => setLastProgressChange(new Date())}
            onClose={() => setIsFillingInBankDetails(false)} />
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
                            validate: () => !!account.beneficiary?.isAccountComplete,
                            onClick: () => setIsFillingInBankDetails(true)
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
    onClose: () => void,
    onValidated: () => void
}) {
    const [email, setEmail] = useState(() => props.email);

    const onVerifyClicked = async () => {
        await createApi().accountEmailSendVerificationEmailPost({
            body: {
                email
            }
        });
    };

    return <AsynchronousProgressDialog
        isOpen={props.isOpen}
        onClose={props.onClose}
        buttonText="Verify"
        isValidatedAccessor={account => account.isEmailVerified}
        requestSentText="E-mail sent! Waiting for verification..."
        requestSendingText="Sending e-mail verification..."
        onValidating={onVerifyClicked}
        onValidated={props.onValidated}
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
    </AsynchronousProgressDialog>
}

function BankDetailsDialog(props: {
    isOpen: boolean,
    onClose: () => void,
    onValidated: () => void
}) {
    const onFillInClicked = async () => {
        const response = await createApi().accountStripeConnectSetupPost();
        
        const popup = window.open(response.activationUrl);
        if(isPopupBlocked(popup)) {
            alert("It looks like your browser is blocking the Stripe activation popup. Unblock it, and try again.");
            return false;
        }
    };

    return <AsynchronousProgressDialog
        isOpen={props.isOpen}
        onClose={props.onClose}
        buttonText="Begin"
        isValidatedAccessor={account => !!account.beneficiary}
        requestSentText="Window opened! Waiting for profile completion..."
        requestSendingText="Fetching Stripe activation link..."
        onValidating={onFillInClicked}
        onValidated={props.onValidated}
    >
        <DialogTitle>We'll send you over to Stripe</DialogTitle>
        <DialogContent className={classes.verifyEmailDialog}>
            <Typography>
                A new window will pop up, which will prompt you to fill in your information through them.
            </Typography>
        </DialogContent>
    </AsynchronousProgressDialog>
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