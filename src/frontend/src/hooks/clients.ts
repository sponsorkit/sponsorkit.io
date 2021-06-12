import { HttpResponse, RestError } from "@azure/core-http";
import { Octokit } from "@octokit/rest";
import { useEffect, useState } from "react";
import { General } from "../api/openapi/src";

export function useOctokit<T>(
    accessor: (octokit: Octokit, abortSignal: AbortSignal) => Promise<T | null>,
    deps: any[]
) {
    const [result, setResult] = useState<T>();
    useEffect(
        () => {
            const abortSignalController = new AbortController();

            const client = createOctokit();
            accessor(client, abortSignalController.signal)
                .then(setResult as any);

            return () => {
                abortSignalController.abort();
            }
        },
        deps);

    return result;
}

export function createOctokit() {
    return new Octokit();
}

export function createApi() {
    return new General(
        null!,
        "http://localhost:5000",
        {
            generateClientRequestIdHeader: true,
            noRetryPolicy: true
        });
}

export function useApi<T>(
    accessor: (client: General, abortSignal: AbortSignal) => Promise<T>,
    deps: any[]
) {
    const [result, setResult] = useState<T>();
    useEffect(
        () => {
            const abortSignalController = new AbortController();

            const client = createApi();
            accessor(client, abortSignalController.signal)
                .then(setResult)
                .catch(e => {
                    if(e instanceof RestError && e.response?.status === 404)
                        return null;

                    throw e;
                });

            return () => {
                abortSignalController.abort();
            }
        },
        deps);

    return result;
}