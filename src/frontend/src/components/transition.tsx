import { Ref } from "react";
import { CSSTransition, TransitionGroup } from "react-transition-group";
import AbsoluteBox from "./absolute-box";
import * as classes from "./transition.module.scss";

export function Transition(props: {
    transitionKey: any,
    children: (ref: Ref<any>) => React.ReactNode|undefined,
    timeout?: number,
    classNames?: {
        default: string,
        enter: string,
        exit?: string
    }
}) {
    let key = props.transitionKey;
    if(!key)
        key = "transition-undefined";

    return <AbsoluteBox>
        {ref => <TransitionGroup>
            <CSSTransition 
                key={key}
                timeout={props.timeout || 1000}
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
                        enterActive: classes.fadingIn,
                        exit: classes.fadingIn,
                        exitActive: classes.fadingOut,
                        exitDone: classes.initial
                    }}
            >
                {props.children(ref) || <></>}
            </CSSTransition>
        </TransitionGroup>}
    </AbsoluteBox>
}