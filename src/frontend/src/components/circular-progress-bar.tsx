import { CircularProgressbarWithChildren as ReactCircularProgressBar, buildStyles } from 'react-circular-progressbar';
import {Box, Typography} from '@material-ui/core';
import * as classes from "./circular-progress-bar.module.scss";
import palette from '@theme/palette';

export default function CircularProgressBar(props: {
    maximum: number,
    current: number,
    size: number
}) {
    const percentage = 100 / props.maximum * props.current;
    const fontSize = props.size / 4;
    return <Box 
        className={classes.root}
        style={{
            width: props.size,
            height: props.size
        }}
    >
        <ReactCircularProgressBar
            value={percentage}
            styles={buildStyles({
                strokeLinecap: 'round',
                pathColor: palette.light.primary.main,
                trailColor: '#eee',
                backgroundColor: '#eee',
            })}
        >
            <Typography 
                className={classes.percentage} 
                fontSize={`${fontSize}px`}
                style={{
                    marginTop: -(props.size / 2 - fontSize)
                }}
            >
                {Math.round(percentage)}%
            </Typography>
        </ReactCircularProgressBar>
    </Box>;
}