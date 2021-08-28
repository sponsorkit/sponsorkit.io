import { Ref, useEffect, useMemo, useRef, useState } from "react";
import * as classes from "./absolute-box.module.scss";

export default function AbsoluteBox(props: {
    children: (ref: Ref<any>) => React.ReactNode
}) {
    const ref = useRef<any|null>(null);

    const [height, setHeight] = useState(0);

    useMemo(
        () => console.log("height-absolute-box", height),
        [height]);

    useEffect(() => {
        if (!ref.current)
            return;

        const updateHeight = () => {
            if(!ref.current)
                return clearInterval(timer);

            const rect = ref.current.getBoundingClientRect();
            setHeight(rect.height);
        }

        updateHeight();

        var timer = setInterval(updateHeight, 100);
        return () => clearInterval(timer);
    }, [ref, ref.current]);

    return (
        <div
            className={classes.root}
            style={{
                height: height
            }}
        >
            {props.children(ref)}
        </div>
    );
}