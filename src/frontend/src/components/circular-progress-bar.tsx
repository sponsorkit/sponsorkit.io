import { Box, Typography } from '@material-ui/core';
import palette from '@theme/palette';
import { CircularProgressbarWithChildren as ReactCircularProgressBar } from 'react-circular-progressbar';
import * as classes from "./circular-progress-bar.module.scss";

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
            styles={{
                path: {
                    strokeLinecap: 'round',
                    stroke: palette.light.primary.main,
                    width: props.size,
                    height: props.size
                },
                trail: {
                    stroke: '#eee',
                    width: props.size,
                    height: props.size
                },
                root: {
                    width: props.size,
                    height: props.size
                },
                background: {
                    width: props.size,
                    height: props.size
                }
            }} />
        <Typography
            className={classes.percentage}
            fontSize={`${fontSize}px`}
            style={{
                top: `${props.size / 2 - fontSize / 2}px`,
                lineHeight: `${fontSize}px`,
                color: palette.light.primary.main,
                width: props.size
            }}
        >
            {Math.round(percentage)}%
        </Typography>
    </Box>;
}