import { combineClassNames } from "@utils/strings";
import { debounce } from "lodash";
import { Ref, useEffect, useRef, useState } from "react";
import * as classes from "./absolute-box.module.scss";

export default function AbsoluteBox(props: {
    children: (ref: Ref<any>) => React.ReactNode,
    className?: string
}) {
    const ref = useRef<HTMLElement|null>(null);

    const [height, setHeight] = useState(0);

    useEffect(
        () => console.debug("height-absolute-box", height),
        [height]);

    useEffect(
        () => {
            if (!ref.current)
                return;

            const absoluteBoxDom = ref.current;

            console.debug("installed-observer", absoluteBoxDom);

            const observer = new ResizeObserver(() => onResized());

            var onUpdate = () => {
                if (!absoluteBoxDom)
                    return;
        
                const rect = absoluteBoxDom.getBoundingClientRect();
                const rectHeight = Math.ceil(rect.height);
                if(isNaN(rectHeight))
                    return;
        
                if(rectHeight !== height) {
                    setHeight(rectHeight);
                }
            }

            var onResized = debounce(onUpdate, 300);
            onUpdate();

            observer.observe(absoluteBoxDom);

            return () => {
                console.info("disconnect-observer");
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