import { combineClassNames } from "@utils/strings";
import { debounce } from "lodash";
import { Ref, useEffect, useRef, useState } from "react";
import * as classes from "./absolute-box.module.scss";

export default function AbsoluteBox(props: {
    children: (ref: Ref<any>) => React.ReactNode,
    className?: string
}) {
    const ref = useRef<any|null>(null);

    const [height, setHeight] = useState(0);

    useEffect(
        () => console.debug("height-absolute-box", height),
        [height]);

    const onUpdate = () => {
        if (!ref.current)
            return;

        const rect = ref.current.getBoundingClientRect();
        const rectHeight = Math.ceil(rect.height);
        if(isNaN(rectHeight))
            return;

        if(rectHeight !== height) 
            setHeight(rectHeight);
    }

    useEffect(
        () => {
            if (!ref.current)
                return;

            console.debug("installed-observer");

            const onResized = debounce(onUpdate, 300);

            const observer = new ResizeObserver(onResized);
            observer.observe(ref.current);

            onResized();

            return () => {
                observer.disconnect();
            };
        },
        [ref, ref.current]);

    return (
        <div
            className={combineClassNames(
                classes.root,
                props.className)}
            style={{
                height: height
            }}
        >
            {props.children(ref)}
        </div>
    );
}