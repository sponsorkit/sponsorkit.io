import { Ref, useEffect, useRef, useState } from "react";
import * as classes from "./absolute-box.module.scss";

export default function AbsoluteBox(props: {
    children: (ref: Ref<any>) => React.ReactNode
}) {
    const ref = useRef<any|null>(null);

    const [height, setHeight] = useState(0);

    useEffect(
        () => console.log("height-absolute-box", height),
        [height]);

    useEffect(() => {
        if (!ref.current)
            return;

        const updateHeight = () => {
            console.log("update-height");
            if(!ref.current)
                return;

            const rect = ref.current.getBoundingClientRect();
            if(rect.height !== height) 
                setHeight(rect.height);
        }

        updateHeight();
    });

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