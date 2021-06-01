import { General } from "./openapi/src";

import {createEmptyPipeline} from "@azure/core-rest-pipeline";

const pipeline = createEmptyPipeline();
pipeline.sendRequest = async function (client, httpRequest) {
    if(httpRequest.url.startsWith("/")) {
        httpRequest.url = window.location.origin + httpRequest.url;
    }

    const response = await client.sendRequest(httpRequest);
    return response;
}

export const apiClient = new General(null!, "", {
    pipeline
});