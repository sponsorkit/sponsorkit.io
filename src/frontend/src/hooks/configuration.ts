import { useApi } from "./clients";

export function useConfiguration() {
    const response = useApi(
        async client => await client.configurationGet({}),
        []);
    if(response === null)
        throw new Error("No configuration was found.");

    return response;
}