import { RestError } from "@azure/core-rest-pipeline";
import { Octokit } from "@octokit/rest";
import { useEffect, useState } from "react";
import { General } from "@sponsorkit/client";
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
    function getBaseUri() {
        const requestUri = new URL(window.location.href);

        const currentUri = new URL(window.location.href);
        requestUri.hostname = `api.${currentUri.hostname}`;

        if (currentUri.hostname === "localhost")
            return "http://localhost:5000";

        return requestUri.toString();
    }

    var client = new General(null!, null!, {
        requestContentType: "application/json; charset=utf-8",
        baseUri: getBaseUri(),
        allowInsecureConnection: true
    });
    client.pipeline.addPolicy({
        name: "allowInsecureConnections",
        sendRequest: async (request, next) => {
            request.allowInsecureConnection = true;

            const response = await next(request);
            return response;
        }
    });
    client.pipeline.addPolicy({
        name: "authorization",
        sendRequest: async (request, next) => {
            const token = getToken();
            if (token)
                request.headers.set("Authorization", `Bearer ${token.raw}`);
                
            const response = await next(request);
            return response;
        }
    });
    return client;
}

export async function makeApiCall<T>(action: (client: General) => Promise<T>): Promise<T | null> {
    try {
        const client = createApi();
        return await action(client);
    } catch (e) {
        if (e instanceof RestError && e.response?.status === 404)
            return null;

        throw e;
    }
}

export async function makeOctokitCall<T>(action: (client: Octokit) => Promise<T>): Promise<T | null> {
    try {
        const client = createOctokit();
        return await action(client);
    } catch (e) {
        if ('status' in e && e.status === 404)
            return null;

        throw e;
    }
}

export function useApi<T>(
    accessor: (client: General, abortSignal: AbortSignal) => Promise<T | null>,
    deps: any[]
) {
    const [result, setResult] = useState<T | null>();
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