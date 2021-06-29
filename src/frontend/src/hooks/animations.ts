import { useMemo } from "react";
import { useCountUp } from "use-count-up";

export function useAnimatedCount(
    accessor: () => number,
    deps: any[]
) {
    const {value: valueAnimated} = useCountUp({
        end: accessor(),
        isCounting: true,
        duration: 2,
        start: 0
    });
    const value = useMemo(
        () => accessor(),
        [deps]);
    return {
        static: value,
        animated: valueAnimated
    };
}