import { DialogProps, Slide } from "@mui/material";
import { TransitionProps } from "@mui/material/transitions";
import { forwardRef } from "react";

const DialogTransition = forwardRef(function Transition(
    props: TransitionProps & {
        children: React.ReactElement<any, any>;
    },
    ref: React.Ref<unknown>
) {
    return <Slide
        direction="up"
        unmountOnExit={false}
        mountOnEnter
        ref={ref}
        {...props} />;
});

export default function getDialogTransitionProps(): Pick<DialogProps,
    "TransitionComponent" |
    "closeAfterTransition"> {
    return {
        TransitionComponent: DialogTransition,
        closeAfterTransition: true
    };
}