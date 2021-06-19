import { RestError } from "@azure/core-rest-pipeline";
import { Octokit } from "@octokit/rest";
import { useEffect, useState } from "react";
import { General } from "../api/openapi/src";
import { getToken } from "./token";

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
    var client = new General(
        {
            async getToken() {
                const token = getToken();
                if(!token)
                    return null;

                return {
                    expiresOnTimestamp: token.expiryDate.getTime(),
                    token: token.raw
                };
            }
        },
        "",
        {});
    client.pipeline.addPolicy({
        name: "baseUrlPolicy",
        sendRequest: async (request, next) => {
            const requestUri = new URL(request.url);

            const currentUri = new URL(window.location.href);
            requestUri.hostname = `api.${currentUri.hostname}`;

            if(currentUri.hostname === "localhost")
                requestUri.hostname = "localhost:5000";
                
            return await next(request);
        }
    });
    return client;
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