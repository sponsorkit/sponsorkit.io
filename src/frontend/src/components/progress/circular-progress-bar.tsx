import { Box, Typography } from '@mui/material';
import palette from '@theme/palette';
import { CircularProgressbarWithChildren as ReactCircularProgressBar } from 'react-circular-progressbar';
import * as classes from "./circular-progress-bar.module.scss";

export default function CircularProgressBar(props: {
    maximum: number,
    current: number,
    size: number,
    className?: string,
    text?: string
}) {
    const size = props.size - 2;

    const percentage = 100 / props.maximum * props.current;
    const fontSize = size / 5;
    return <Box
        className={`${classes.root} ${props.className}`}
        style={{
            width: size,
            height: size,
            minWidth: size,
            minHeight: size,
            maxWidth: size,
            maxHeight: size
        }}
    >
        <ReactCircularProgressBar
            value={percentage}
            className={classes.progressBar}
            styles={{
                path: {
                    strokeLinecap: 'round',
                    stroke: palette.light.primary.main,
                    width: size,
                    height: size
                },
                trail: {
                    stroke: '#eee',
                    width: size,
                    height: size
                },
                root: {
                    width: size,
                    height: size
                },
                background: {
                    width: size,
                    height: size
                }
            }} />
        <Typography
            className={classes.percentage}
            fontSize={`${fontSize}px`}
            style={{
                top: `${size / 2 - fontSize / 2}px`,
                lineHeight: `${fontSize}px`,
                color: palette.light.primary.main,
                width: size
            }}
        >
            {props.text || `${Math.round(percentage)}%`}
        </Typography>
    </Box>;
}