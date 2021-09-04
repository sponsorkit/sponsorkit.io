import { Accordion, AccordionDetails, AccordionSummary, Box, Button, Card, CardContent, FormControlLabel, Typography } from "@material-ui/core";
import { DoneSharp, ExpandMore, HelpOutline } from "@material-ui/icons";
import CircularProgressBar from "./circular-progress-bar";
import * as classes from "./progress-list.module.scss";

type CheckpointProps = {
    validate: () => boolean,
    label: string,
    description: string,
    onClick?: () => void
};

export default function ProgressList(props: {
    title: string,
    subTitle: string,
    checkpoints: Array<CheckpointProps>
}) {
    const totalCheckpointCount = props.checkpoints.length;
    const validatedCheckpointCount = props.checkpoints
        .filter(x => x.validate())
        .length;
    const firstNonValidatedCheckpointIndex = props.checkpoints.findIndex(x => !x.validate());
    return <Card className={classes.progressList}>
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
                        <AccordionSummary className={classes.accordionSummary} expandIcon={<ExpandMore />}>
                            <FormControlLabel
                                classes={{
                                    label: classes.header
                                }}
                                control={x.validate() ?
                                    <DoneSharp
                                        className={classes.checkbox}
                                        color="primary" /> :
                                    <HelpOutline
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