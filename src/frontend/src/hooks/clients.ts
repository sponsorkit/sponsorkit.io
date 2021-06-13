import { RestError } from "@azure/core-http";
import { Octokit } from "@octokit/rest";
import { useEffect, useState } from "react";
import { General } from "../api/openapi/src";

export function useOctokit<T>(
    accessor: (octokit: Octokit, abortSignal: AbortSignal) => Promise<T | null>,
    deps: any[]
) {
    const [result, setResult] = useState<T | null | undefined>();
    useEffect(
        () => {
            const abortSignalController = new AbortController();

            async function effect() {
                const result = await makeOctokitCall(async (client) => 
                    await accessor(client, abortSignalController.signal));
                setResult(result);
            }

            effect();

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

export async function makeApiCall<T>(action: (client: General) => Promise<T>): Promise<T|null> {
    try {
        const client = createApi();
        return await action(client);
    } catch(e) {
        if(e instanceof RestError && e.response?.status === 404)
            return null;

        throw e;
    }
}

export async function makeOctokitCall<T>(action: (client: Octokit) => Promise<T>): Promise<T|null> {
    try {
        const client = createOctokit();
        return await action(client);
    } catch(e) {
        if('status' in e && e.status === 404)
            return null;

        throw e;
    }
}

export function useApi<T>(
    accessor: (client: General, abortSignal: AbortSignal) => Promise<T|null>,
    deps: any[]
) {
    const [result, setResult] = useState<T|null>();
    useEffect(
        () => {
            const abortSignalController = new AbortController();

            async function effect() {
                const result = await makeApiCall(async (client) => 
                    await accessor(client, abortSignalController.signal));
                setResult(result);
            }

            effect();

            return () => {
                abortSignalController.abort();
            }
        },
        deps);

    return result;
}