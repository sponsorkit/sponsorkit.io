import { Tooltip } from "@mui/material";
import { combineClassNames } from "@utils/strings";
import classes from "./currency.module.scss";

export default function Currency(props: {
    amount: number,
    className?: string
}) {
    return <Tooltip title={`$${props.amount} USD`}>
        <span className={combineClassNames(
            classes.span,
            props.className)}
        >
            ${props.amount}
        </span>
    </Tooltip>;
}