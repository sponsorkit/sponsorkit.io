import { RestError } from "@azure/core-rest-pipeline";
import { Octokit } from "@octokit/rest";
import { General } from "@sponsorkit/client";
import { useEffect, useState } from "react";
import { getToken, getTokenFromString, persistToken } from "./token";

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
    const client = new Octokit({
        baseUrl: `${getBaseUri()}octokit`
    });
    return client;
}

function getBaseUri() {
    const currentUri = new URL(window.location.href);
    if (currentUri.hostname === "localhost")
        return "http://localhost:5000/";

    if(currentUri.hostname.endsWith(".vercel.app"))
        return "https://k8ca3w7mxf.execute-api.eu-north-1.amazonaws.com/";

    const requestUri = new URL(window.location.href);
    requestUri.hostname = `mjxj2y2vx5.execute-api.eu-north-1.amazonaws.com`;
    requestUri.pathname = "/";
    requestUri.search = "";
    requestUri.hash = "";
    return requestUri.toString();
}

export function createApi() {
    var client = new General(null!, getBaseUri(), {
        requestContentType: "application/json; charset=utf-8",
        baseUri: getBaseUri(),
        allowInsecureConnection: true
    });
    client.pipeline.addPolicy({
        name: "timeout",
        sendRequest: async (request, next) => {
            request.timeout = 30000;

            const response = await next(request);
            return response;
        }
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
            let token = getToken();
            if (token) {
                if(token.isExpired) {
                    persistToken(null);

                    try {
                        const refreshResponse = await client.accountTokenRefreshPost({
                            body: {
                                token: token.raw
                            }
                        });

                        const newToken = refreshResponse.token;
                        persistToken(newToken);

                        token = getTokenFromString(newToken);
                    } catch(e) {
                        persistToken(token.raw);
                        throw e;
                    }
                }

                request.headers.set("Authorization", `Bearer ${token.raw}`);
            }

            return await next(request);
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
        if (typeof e === "object" && e && 'status' in e && (e as any).status === 404)
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
                if(deps.findIndex(x => !x) > -1)
                    return;
                    
                setResult(undefined);
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