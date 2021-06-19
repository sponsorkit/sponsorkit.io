import { useCallback, useEffect, useState } from "react";

export function useLocalStorage(key: string): [string, (value: string) => void] {
    const [currentValue, setCurrentValue] = useState(() => 
        typeof localStorage === "undefined" ? 
            "" : 
            (localStorage?.getItem(key) ?? ""));
    const setLocalStorage = useCallback(
        (value: string) => {
            localStorage.setItem(key, value);
            onStorage({
                key,
                newValue: value
            });
        },
        []);
    const onStorage = useCallback(
        (e: Partial<StorageEvent>) => {
            if(e.key !== key)
                return;
                
            const newValue = e.newValue;
            if(newValue === currentValue)
                return;

            setCurrentValue(newValue ?? "");
        },
        []);

    useEffect(
        () => {
            window.addEventListener("storage", onStorage);

            return () => {
                window.removeEventListener("storage", onStorage);
            };
        },
        []);

    return [currentValue, setLocalStorage];
}