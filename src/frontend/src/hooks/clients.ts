import { Octokit } from "@octokit/rest";
import { useEffect, useRef, useState } from "react";

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