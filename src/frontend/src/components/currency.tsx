import { Tooltip } from "@mui/material";

export default function Currency(props: {
    amount: number
}) {
    return <Tooltip title={`$${props.amount} USD`}><b>${props.amount}</b></Tooltip>;
}