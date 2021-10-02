import { DoneSharp, ExpandMore, HelpOutline } from "@mui/icons-material";
import { Accordion, AccordionDetails, AccordionSummary, Box, Button, CircularProgress, FormControlLabel, Typography } from "@mui/material";
import { combineClassNames } from "@utils/strings";
import { useEffect, useState } from "react";
import CircularProgressBar from "./circular-progress-bar";
import * as classes from "./progress-list.module.scss";

type CheckpointProps<TValidationTarget> = {
    validate: (validationTarget: TValidationTarget) => boolean,
    label: string,
    description: string,
} & (CheckpointDefaultChildrenProps | CheckpointCustomChildrenProps);

type CheckpointDefaultChildrenProps = {
    onClick?: () => void,
}

type CheckpointCustomChildrenProps = {
    children: (isValidated: boolean) => React.ReactNode
}

export default function ProgressList<TValidationTarget>(props: {
    title: string,
    validationTarget: TValidationTarget|undefined,
    subTitle: string,
    checkpoints: Array<CheckpointProps<TValidationTarget>>,
    onValidated?: (validates: boolean) => void
}) {
    const totalCheckpointCount = props.checkpoints.length;
    const getValidatedCheckpointCount = () => props.checkpoints
        .filter(x => 
            props.validationTarget && 
            x.validate(props.validationTarget))
        .length;
    const getFirstNonValidatedCheckpointIndex = () => props.checkpoints
        .findIndex(x => 
            props.validationTarget && 
            !x.validate(props.validationTarget));

    const [expandStates, setExpandStates] = useState(props.checkpoints
        .map(() => false));

    const toggleExpandState = (index: number, value?: boolean) => {
        const newExpandStates = [...expandStates];
        newExpandStates[index] = typeof value === "boolean" ? 
            value :
            !newExpandStates[index];
        setExpandStates(newExpandStates);
    };

    useEffect(
        () => {
            if(!props.validationTarget)
                return;

            toggleExpandState(
                getFirstNonValidatedCheckpointIndex(),
                true);
        },
        [props.validationTarget]);

    useEffect(
        () => {
            if(!props.validationTarget)
                return;

            const validated = getFirstNonValidatedCheckpointIndex() === -1;
            props.onValidated && props.onValidated(validated);
        });
        
    return <>
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
                current={getValidatedCheckpointCount()}
                maximum={totalCheckpointCount}
                className={combineClassNames(
                    classes.progressBar,
                    props.validationTarget && classes.loaded)}
                text={props.validationTarget ?
                    `${getValidatedCheckpointCount()} / ${totalCheckpointCount}` :
                    "?"}
            />
        </Box>
        <Box className={classes.accordions}>
            {props.checkpoints.map((x, i) => {
                const validated = props.validationTarget ?
                    x.validate(props.validationTarget) :
                    false;

                return <Accordion 
                    className={classes.accordion} 
                    expanded={expandStates[i]}
                    onChange={() => toggleExpandState(i)}
                    key={`checkpoint-${i}`}
                >
                    <AccordionSummary 
                        className={classes.accordionSummary} 
                        expandIcon={props.validationTarget ?
                            <ExpandMore /> :
                            null}
                    >
                        <FormControlLabel
                            classes={{
                                label: classes.header
                            }}
                            control={props.validationTarget ?
                                (validated ?
                                    <DoneSharp
                                        className={classes.checkbox}
                                        color="primary" /> :
                                    <HelpOutline
                                        className={classes.checkbox}
                                        color="disabled" />) :
                                <CircularProgress 
                                    size={20} 
                                    className={combineClassNames(
                                        classes.checkbox,
                                        classes.progressBar)} />}
                            label={x.label}
                        />
                    </AccordionSummary>
                    <AccordionDetails className={classes.accordionDetails}>
                        <Typography className={classes.description} color="textSecondary">
                            {x.description}
                        </Typography>
                        {!!props.validationTarget &&
                            ('children' in x ?
                                x.children(validated) :
                                <Button 
                                    className={classes.completeButton} 
                                    variant="contained"
                                    onClick={x.onClick}
                                    disabled={validated}
                                >
                                    {validated ? 
                                        "Completed" : 
                                        "Begin"}
                                </Button>)}
                    </AccordionDetails>
                </Accordion>;
            })}
        </Box>
    </>
}