import { combineClassNames } from "@utils/strings";
import { delay } from "@utils/time";
import { ReactNode, RefObject, useEffect, useRef, useState } from "react";
import * as classes from "./transition.module.scss";

export function Transition<TState extends (null | undefined | {})>(props: {
    debugMode?: boolean,
    state?: TState | null | undefined,
    render: (args: {
        state?: TState | null | undefined, 
        className: string,
        ref: RefObject<HTMLElement>
    }) => ReactNode|Promise<ReactNode>
}) {
    const transitionDuration = 5000;

    const oldDomRef = useRef<HTMLElement>(null);
    const newDomRef = useRef<HTMLElement>(null);
    
    const [oldState, setOldState] = useState<TState | null | undefined>(() => props.state);

    const getClassName = (input: keyof typeof classes) => props.debugMode ?
        `${input} ${classes[input]}` as string :
        classes[input] as string;
        
    const renderOld = (...classNames: (string|false|undefined|null)[])  => {
        setOldDom(
            props.render({
                state: oldState, 
                ref: oldDomRef, 
                className: combineClassNames(
                    getClassName("oldState"),
                    ...classNames)
            }));
    }

    const renderNew = (...classNames: (string|false|undefined|null)[]) => {
        setNewDom(
            props.render({
                state: props.state, 
                ref: newDomRef, 
                className: combineClassNames(
                    getClassName("newState"),
                    ...classNames)
            }));
    }

    const [oldDom, setOldDom] = useState<React.ReactNode>();
    const [newDom, setNewDom] = useState<React.ReactNode>();

    useEffect(
        () => {
            async function effect() {
                try {
                    if(props.state === null) {
                        renderOld(getClassName("loading"));
                        await delay(transitionDuration);
                        renderNew(
                            getClassName("loaded"),
                            getClassName("notFound"));
                        return;
                    }

                    if(props.state === undefined) {
                        renderOld(getClassName("loading"));
                        renderNew(getClassName("loading"));
                        return;
                    }

                    if(props.state) {
                        const oldState = props.state;
                        renderOld(getClassName("loading"));
                        renderNew(
                            getClassName("loaded"),
                            getClassName("found"));
                        await delay(transitionDuration);
                        setOldState(oldState);
                        return;
                    }
                } finally {
                }
            }

            effect();
        }, 
        [props.state]);

    useEffect(
        () => renderOld(),
        [oldState]);

    return <div 
        className={classes.root}
    >
        {oldDom}
        {newDom}
    </div>;
}