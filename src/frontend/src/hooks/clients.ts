import { getSdk } from "@api/octokit/graphql";
import { RestError } from "@azure/core-rest-pipeline";
import { Octokit } from "@octokit/rest";
import { General } from "@sponsorkit/client";
import { useEffect, useState } from "react";
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

export function useOctokitGraphQL<TAccessorResult, TExtractorResult>(
    accessor: (client: ReturnType<typeof createOctokitGraphQL>, abortSignal: AbortSignal) => Promise<TAccessorResult | null>,
    extractor: (result: TAccessorResult) => TExtractorResult,
    deps: any[]
): TExtractorResult | null | undefined {
    const [result, setResult] = useState<TExtractorResult | null | undefined>();

    useEffect(
        () => {                
            const abortSignalController = new AbortController();

            async function effect() {
                if(deps.findIndex(x => !x) > -1)
                    return;

                const client = createOctokitGraphQL();
                const response = await accessor(client, abortSignalController.signal);
                if(!response)
                    return setResult(null);

                setResult(extractor(response));
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

type OctokitGraphQLOptions = {
    abortSignal: AbortSignal
}
export function createOctokitGraphQL() {
    return getSdk<OctokitGraphQLOptions>(async (query, variables, options) => {
        const url = `${getBaseUri()}/github/graphql`;
        const result = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                query: query.loc?.source.body,
                variables
            }),
            signal: options?.abortSignal
        });
        return await result.json();
    });
}
function getBaseUri() {
    const currentUri = new URL(window.location.href);
    if (currentUri.hostname === "localhost")
        return "http://localhost:5000";

    const requestUri = new URL(window.location.href);
    requestUri.hostname = `api.${currentUri.hostname}`;
    requestUri.pathname = "";
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
            request.timeout = 10000;

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
            const token = getToken();
            if (token)
                request.headers.set("Authorization", `Bearer ${token.raw}`);

            let response = await next(request);
            if (response.status === 401) {
                request.headers.delete("Authorization");
                localStorage.removeItem("token");
                response = await next(request);
            }

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