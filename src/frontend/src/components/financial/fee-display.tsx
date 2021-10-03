import FeesTooltip from "@components/tooltips/fees-tooltip-contents";
import TooltipLink from "@components/tooltips/tooltip-link";
import { Transition } from "@components/transitions/transition";
import { CircularProgress, Typography } from "@mui/material";
import { combineClassNames } from "@utils/strings";
import React from "react";
import * as classes from "./fee-display.module.scss";

export function FeeDisplay(props: {
    amount: number,
    fee: number|null|undefined
}) {
    return <Transition 
        className={classes.summary}
        transitionKey={`fee-display-${props.amount}-${props.fee}`}
    >
        {ref => !props.fee ?
            <Typography
                ref={ref} 
                className={combineClassNames(
                    classes.calculating,
                    classes.text)}
            >
                <CircularProgress className={classes.spinner} />
                Calculating total charge amount...
            </Typography> :
            <Typography
                ref={ref} 
                className={combineClassNames(
                    classes.calculated,
                    classes.text)}
            >
                ${props.amount + props.fee} will be charged (including <TooltipLink text="fees"><FeesTooltip /></TooltipLink>)
            </Typography>}
    </Transition>;
}