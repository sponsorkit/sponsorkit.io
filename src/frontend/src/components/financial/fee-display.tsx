import { Typography } from "@mui/material";
import React from "react";
import * as classes from "./fee-display.module.scss";

export function FeeDisplay(props: {
    amount: number
}) {
    const getSponsorkitFees = () =>
        props.amount * 0.01;

    const getStripeFees = () =>
        (props.amount * 0.029) + 0.30;

    return <Typography className={classes.summary}>
        ${(props.amount + getStripeFees() + getSponsorkitFees()).toFixed(2)} will be charged (including <a href="https://stripe.com/pricing" target="_blank">Stripe fee</a>)
    </Typography>
}