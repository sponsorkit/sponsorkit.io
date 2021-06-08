import { useCallback, useEffect, useState } from "react";

export function useLocalStorage(key: string): [string, (value: string) => void] {
    const [currentValue, setCurrentValue] = useState(() => localStorage?.getItem(key) ?? "");
    const setLocalStorage = useCallback(
        (value: string) => localStorage.setItem(key, value),
        []);

    useEffect(
        () => {
            const onStorage = (e: StorageEvent) => {
                const newValue = localStorage?.getItem(key) ?? "";
                if(newValue === currentValue)
                    return;

                setCurrentValue(newValue);
            };
            window.addEventListener("storage", onStorage);

            return () => {
                window.removeEventListener("storage", onStorage);
            };
        },
        []);

    return [currentValue, setLocalStorage];
}