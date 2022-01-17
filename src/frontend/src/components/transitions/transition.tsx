import AbsoluteBox from "@components/absolute-box";
import { Ref } from "react";
import { CSSTransition, TransitionGroup } from "react-transition-group";
import classes from "./transition.module.scss";

export function Transition(props: {
    transitionKey: any,
    children: (ref: Ref<any>) => React.ReactNode|undefined,
    timeout?: number,
    className?: string,
    classNames?: {
        default: string,
        enter: string,
        exit?: string
    }
}) {
    let key = props.transitionKey;
    return <AbsoluteBox className={props.className}>
        {ref => {
            return <TransitionGroup className={classes.root}>
                <CSSTransition 
                    key={`transition-${key}`}
                    timeout={props.timeout || 250}
                    mountOnEnter
                    unmountOnExit
                    classNames={props.classNames ?
                        {
                            enter: props.classNames.default,
                            enterActive: props.classNames.enter,
                            exit: props.classNames.enter,
                            exitActive: 
                                props.classNames.exit || 
                                props.classNames.default
                        } : {
                            enter: classes.initial,
                            enterActive: classes["fading-in"],
                            exit: classes["fading-in"],
                            exitActive: classes["fading-out"],
                            exitDone: classes.initial
                        }}
                >
                    {props.children(ref) || <div ref={ref} style={{
                        width: 0,
                        height: 0,
                        padding: 0,
                        margin: 0
                    }} />}
                </CSSTransition>
            </TransitionGroup>;
        }}
    </AbsoluteBox>
}