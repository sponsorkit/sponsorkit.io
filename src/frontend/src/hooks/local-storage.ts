import { useEffect, useState } from 'react';

// ----------------------------------------------------------------------

export default function useLocalStorage(key: string, defaultValue: string|null) {
  const [value, setValue] = useState<string|null>(() => {
    if(typeof localStorage === "undefined")
      return defaultValue;

    const storedValue = localStorage.getItem(key);
    return storedValue === null ? 
      defaultValue : 
      storedValue;
  });

  useEffect(() => {
    const listener = (e: StorageEvent) => {
      if (e.storageArea === localStorage && e.key === key) {
        setValue(e.newValue);
      }
    };
    window.addEventListener('storage', listener);

    return () => {
      window.removeEventListener('storage', listener);
    };
  }, [key, defaultValue]);

  const setValueInLocalStorage = (newValue: string) => {
    setValue(() => {
      const result = newValue;
      localStorage.setItem(key, newValue);
      return result;
    });
  };

  return [value, setValueInLocalStorage] as const;
}
