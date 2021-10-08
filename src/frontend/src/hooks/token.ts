import { useMemo } from "react";
import useLocalStorage from "./local-storage";

type TokenData = {
    data: RawData,
    userId: string,
    expiryDate: Date,
    isExpired: boolean,
    raw: string
};

export function getToken() {
    const token = typeof localStorage !== "undefined" && localStorage.getItem("token");
    return getTokenFromString(token);
}

export function persistToken(token: string|null|undefined) {
    if(typeof localStorage === "undefined")
        return;

    if(token) {
        localStorage.setItem("token", token);
    } else {
        localStorage.removeItem("token");
    }
}

export function useToken(): [TokenData|null, (token: string) => void] {
    const [token, setToken] = useLocalStorage<string|null>("token", null);
    const computedToken = useMemo(
        () => getTokenFromString(token),
        [token]);

    return [computedToken, setToken];
}

export function getTokenFromString(token: string): TokenData
export function getTokenFromString(token: string|null|undefined|false): TokenData|null
export function getTokenFromString(token: string|null|false|undefined) {
    if(!token)
        return null;
        
    return {
        raw: token,
        data: getJwtData(token),
        userId: getUserId(token),
        expiryDate: getExpiryDate(token),
        isExpired: isExpired(token)
    }
}

function getJwtData(token: string): RawData {
    const [, data] = token.split('.');
    const json = atob(data);

    return JSON.parse(json);
}

function getJwtDataKey<K extends keyof RawData>(token: string, key: K): RawData[K] {
    const data = getJwtData(token);
    if(!data)
        throw new Error(`Could not find ${key} of token ${token}`);

    return data[key];
}

function getUserId(token: string) {
    return getJwtDataKey(token, "sub");
}

function getExpiryDate(token: string) {
    const jwtData = getJwtData(token);
    const expiryDate = new Date(jwtData.exp * 1000);
    return expiryDate;
}

function isExpired(token: string) {
    const expiryDate = getExpiryDate(token);
    if(!expiryDate)
        return false;

    const now = new Date();

    const oneMinute = 1000 * 60;
    const isTokenExpired = now.getTime() > expiryDate.getTime() - oneMinute;
    return isTokenExpired;
}

type RawData = {
    sub: string;
    iss: number;
    exp: number;
    role: string|string[];
}