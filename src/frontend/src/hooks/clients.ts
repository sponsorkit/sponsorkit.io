import { ApolloClient, HttpLink, InMemoryCache, LazyQueryHookOptions, QueryResult, QueryTuple } from "@apollo/client";
import { RestError } from "@azure/core-rest-pipeline";
import { Octokit } from "@octokit/rest";
import { General } from "@sponsorkit/client";
import { useEffect, useMemo, useState } from "react";
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

export function useOctokitGraphQL<TQuery, TParameters, TResult>(
    useLazyQuery: (baseOptions?: LazyQueryHookOptions<TQuery, TParameters>) => QueryTuple<TQuery, TParameters>,
    extractor: (result: QueryResult<TQuery, TParameters>["data"]) => TResult,
    variableAccessor: () => TParameters|undefined|null,
    deps: any[]
): TResult | null | undefined {
    const [runQuery, {data, error}] = useLazyQuery({
        client: createOctokitGraphQL()
    });

    const computedResult = useMemo(
        () => error || !data ? null : extractor(data),
        [error, data])

    useEffect(
        () => {                
            const abortSignalController = new AbortController();

            async function effect() {
                if(deps.findIndex(x => !x) > -1)
                    return;
    
                const variables = variableAccessor();
                if(!variables)
                    return;

                runQuery({
                    variables: variables!,
                    context: {
                        fetchOptions: {
                            signal: abortSignalController.signal
                        }
                    }
                });
            }

            effect();

            return () => {
                abortSignalController.abort();
            }
        },
        deps);

    return computedResult;
}

export function createOctokit() {
    return new Octokit();
}

export function createOctokitGraphQL() {
    return new ApolloClient({
        link: new HttpLink({
            uri: "https://api.github.com/graphql",
        }),
        cache: new InMemoryCache()
    });
}

export function createApi() {
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