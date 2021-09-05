import { DialogProps, Slide } from "@material-ui/core";
import { TransitionProps } from "@material-ui/core/transitions";
import { forwardRef, ReactElement } from "react";

const DialogTransition = forwardRef(function Transition(
    props: TransitionProps & { children?: ReactElement<any, any> },
    ref: React.Ref<unknown>,
) {
    return <Slide 
        direction="up"
        unmountOnExit
        mountOnEnter
        ref={ref} 
        {...props} />;
});

export default function getDialogTransitionProps(): Pick<DialogProps, 
    "TransitionComponent" | 
    "closeAfterTransition"> 
{
    return {
        TransitionComponent: DialogTransition,
        closeAfterTransition: true
    };
}