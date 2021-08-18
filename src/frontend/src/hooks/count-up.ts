import { useEffect, useMemo, useRef, useState } from "react";
import { useCountUp } from "use-count-up";

export function usePrevious<T>(value: T) {
    const ref = useRef<T>();
    useEffect(() => {
        ref.current = value;
    });
    return ref.current;
}

export function useAnimatedCount(
    accessor: () => number,
    deps: any[]
) {
    const current = useMemo(accessor, deps);
    const [previous, setPrevious] = useState(0);

    const countUp = useCountUp({
        end: current,
        isCounting: true,
        start: previous,
        autoResetKey: `animation-${current}`,
        onComplete: () => {
            setPrevious(current);
        }
    });
    return {
        current: current,
        animated: countUp.value,
        previous
    };
}