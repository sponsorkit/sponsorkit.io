import { useCallback, useEffect, useState } from "react";

export function useLocalStorage(key: string): [string, (value: string) => void] {
    const [currentValue, setCurrentValue] = useState(() => 
        typeof localStorage === "undefined" ? 
            "" : 
            (localStorage?.getItem(key) ?? ""));
    const setLocalStorage = useCallback(
        (value: string) => typeof localStorage !== "undefined" && localStorage.setItem(key, value),
        []);

    useEffect(
        () => {
            if(typeof localStorage === "undefined")
                return;

            const onStorage = (e: StorageEvent) => {
                if(e.key !== key)
                    return;
                    
                const newValue = e.newValue;
                if(newValue === currentValue)
                    return;

                setCurrentValue(newValue ?? "");
            };
            window.addEventListener("storage", onStorage);

            return () => {
                window.removeEventListener("storage", onStorage);
            };
        },
        []);

    return [currentValue, setLocalStorage];
}