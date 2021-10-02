
import { Button, Step, StepContent, StepLabel, Stepper } from "@mui/material";
import React, { useEffect, useMemo, useState } from 'react';
import * as classes from './vertical-linear-stepper.module.scss';



type Step = {
    title: string,
    component: React.ReactNode,
    onCompleted?: () => Promise<void> | void
}

export default function VerticalLinearStepper(props: {
    steps: Step[],
    onChanged?: (index: number) => void,
    onCompleted?: () => Promise<void> | void
}) {
    const [isLoading, setIsLoading] = useState(false);
    const [activeStepIndex, setActiveStepIndex] = useState(0);

    const steps = props.steps;
    const activeStep = useMemo(
        () => props.steps[activeStepIndex],
        [activeStepIndex, props.steps]);

    useEffect(
        () => props.onChanged && props.onChanged(activeStepIndex),
        [activeStep]);

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

            if (activeStepIndex + 1 >= steps.length) {
                props.onCompleted && await Promise.resolve(props.onCompleted());
                return;
            }

            setActiveStepIndex((prevActiveStep) => prevActiveStep + 1);
        });
    };

    const handleBack = async () => {
        if(activeStepIndex <= 0)
            return;

        await wrapInLoading(async () => {
            setActiveStepIndex((prevActiveStep) => prevActiveStep - 1);
        });
    };

    return (
        <Stepper className={classes.root} activeStep={activeStepIndex} orientation="vertical">
            {steps.map((label) => (
                <Step key={label.title}>
                    <StepLabel>{label.title}</StepLabel>
                    <StepContent>
                        <div className={classes.stepContainer}>{activeStep.component}</div>
                        <div className={classes.actionsContainer}>
                            <div>
                                <Button
                                    variant="outlined"
                                    disableElevation
                                    disabled={activeStepIndex === 0 || isLoading}
                                    onClick={handleBack}
                                    className={classes.button}
                                >
                                    Back
                                </Button>
                                <Button
                                    disableElevation
                                    variant="contained"
                                    color="primary"
                                    onClick={handleNext}
                                    className={classes.button}
                                    disabled={isLoading}
                                >
                                    {activeStepIndex === steps.length - 1 ? 'Finish' : 'Continue'}
                                </Button>
                            </div>
                        </div>
                    </StepContent>
                </Step>
            ))}
        </Stepper>
    );
}