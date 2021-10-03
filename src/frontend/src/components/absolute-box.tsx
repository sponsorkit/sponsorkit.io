import { combineClassNames } from "@utils/strings";
import { Ref, useEffect, useRef, useState } from "react";
import * as classes from "./absolute-box.module.scss";

export default function AbsoluteBox(props: {
    children: (ref: Ref<any>) => React.ReactNode,
    className?: string
}) {
    const ref = useRef<any|null>(null);

    const [height, setHeight] = useState(0);

    useEffect(
        () => console.log("height-absolute-box", height),
        [height]);

    useEffect(() => {
        if (!ref.current)
            return;

        const rect = ref.current.getBoundingClientRect();
        const rectHeight = Math.ceil(rect.height);
        if(isNaN(rectHeight))
            return;

        if(rectHeight !== height) 
            setHeight(rectHeight);
    });

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