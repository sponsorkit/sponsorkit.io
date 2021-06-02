import { Octokit } from "@octokit/rest";
import { useEffect, useState } from "react";
import { General } from "../api/openapi/src";

export function useOctokit<T>(accessor: (octokit: Octokit, abortSignal: AbortSignal) => Promise<T>) {
    const [result, setResult] = useState<T>();
    useEffect(
        () => {
            const abortSignalController = new AbortController();

            const client = new Octokit();
            accessor(client, abortSignalController.signal)
                .then(setResult);

            return () => {
                abortSignalController.abort();
            }
        },
        []);

    return result;
}

export function createApi() {
    return new General(
        {
            getToken: async () => ({token: "dummy", expiresOnTimestamp: 13371337})
        },
        "");
}

export function useApi<T>(accessor: (client: General, abortSignal: AbortSignal) => Promise<T>) {
    const [result, setResult] = useState<T>();
    useEffect(
        () => {
            const abortSignalController = new AbortController();

            const client = createApi();
            accessor(client, abortSignalController.signal)
                .then(setResult);

            return () => {
                abortSignalController.abort();
            }
        },
        []);

    return result;
}