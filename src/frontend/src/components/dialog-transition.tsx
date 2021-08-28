import { Slide } from "@material-ui/core";
import { TransitionProps } from "@material-ui/core/transitions";
import { forwardRef, ReactElement } from "react";

export const DialogTransition = forwardRef(function Transition(
    props: TransitionProps & { children?: ReactElement<any, any> },
    ref: React.Ref<unknown>,
) {
    return <Slide direction="up" ref={ref} {...props} />;
});