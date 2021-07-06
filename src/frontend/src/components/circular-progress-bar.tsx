import { CircularProgressbarWithChildren as ReactCircularProgressBar, buildStyles } from 'react-circular-progressbar';
import { Box, Typography } from '@material-ui/core';
import * as classes from "./circular-progress-bar.module.scss";
import palette from '@theme/palette';

export default function CircularProgressBar(props: {
    maximum: number,
    current: number,
    size: number,
    className?: string
}) {
    const percentage = 100 / props.maximum * props.current;
    const fontSize = props.size / 5;
    return <Box
        className={`${classes.root} ${props.className}`}
        style={{
            width: props.size,
            height: props.size
        }}
    >
        <ReactCircularProgressBar
            value={percentage}
            className={classes.progressBar}
            styles={buildStyles({
                strokeLinecap: 'round',
                pathColor: palette.light.primary.main,
                trailColor: '#eee',
                backgroundColor: '#eee'
            })} />
        <Typography
            className={classes.percentage}
            fontSize={`${fontSize}px`}
            style={{
                top: `${props.size / 2 - fontSize / 2}px`,
                lineHeight: `${fontSize}px`,
                color: palette.light.primary.main
            }}
        >
            {Math.round(percentage)}%
        </Typography>
    </Box>;
}