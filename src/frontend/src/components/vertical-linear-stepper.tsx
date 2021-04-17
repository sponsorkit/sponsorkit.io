
import React, { useState } from 'react';

import { Button, createStyles, makeStyles, Step, StepContent, StepLabel, Stepper, Theme } from "@material-ui/core";

const useStyles = makeStyles((theme: Theme) =>
    createStyles({
        root: {
            width: '100%'
        },
        button: {
            marginTop: theme.spacing(1),
            marginRight: theme.spacing(1),
        },
        actionsContainer: {
            marginBottom: theme.spacing(2),
        },
        resetContainer: {
            padding: theme.spacing(3),
        },
    }),
);

type Step = {
    title: string,
    render: () => React.ReactNode,
    onCompleted?: () => Promise<void> | void
}

export default function VerticalLinearStepper(props: {
    steps: Step[],
    onCompleted?: () => Promise<void> | void
}) {
    const classes = useStyles();
    const [isLoading, setIsLoading] = useState(false);
    const [activeStepIndex, setActiveStepIndex] = useState(0);

    const steps = props.steps;
    const activeStep = steps[activeStepIndex];

    const wrapInLoading = async (action: () => Promise<void>|void) => {
        if(isLoading)
            return;

        setIsLoading(true);

        try {
            await action();
        } finally {
            setTimeout(() => setIsLoading(false), 250);
        }
    }

    const handleNext = async () => {
        await wrapInLoading(async () => {
            const onStepCompleted = activeStep.onCompleted;
            if (onStepCompleted)
                await Promise.resolve(onStepCompleted());

            if (activeStepIndex + 1 === steps.length && props.onCompleted)
                await Promise.resolve(props.onCompleted());

            setActiveStepIndex((prevActiveStep) => prevActiveStep + 1);
        });
    };

    const handleBack = async () => {
        await wrapInLoading(async () => {
            setActiveStepIndex((prevActiveStep) => prevActiveStep - 1);
        });
    };

    return (
        <div className={classes.root}>
            <Stepper activeStep={activeStepIndex} orientation="vertical">
                {steps.map((label) => (
                    <Step key={label.title}>
                        <StepLabel>{label.title}</StepLabel>
                        <StepContent>
                            <>{activeStep.render()}</>
                            <div className={classes.actionsContainer}>
                                <div>
                                    <Button
                                        disabled={activeStepIndex === 0 || isLoading}
                                        onClick={handleBack}
                                        className={classes.button}
                                    >
                                        Back
                                    </Button>
                                    <Button
                                        variant="contained"
                                        color="primary"
                                        onClick={handleNext}
                                        className={classes.button}
                                        disabled={isLoading}
                                    >
                                        {activeStepIndex === steps.length - 1 ? 'Finish' : 'Next'}
                                    </Button>
                                </div>
                            </div>
                        </StepContent>
                    </Step>
                ))}
            </Stepper>
        </div>
    );
}