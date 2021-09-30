import { Tooltip, Typography, useTheme } from "@mui/material";
import * as classes from "./tooltip-link.module.scss";

export default function TooltipLink(props: {
    children: React.ReactNode,
    text: string
}) {
    const theme = useTheme();
    return <Tooltip 
        className={classes.tooltip} 
        title={<>{props.children}</>}
    >
        <Typography 
            className={classes.typography}
            style={{
                color: theme.palette.primary.light
            }}
        >
            {props.text}
        </Typography>
    </Tooltip>
}