import { TokenCredential } from "@azure/core-auth";
import { OperationArguments, OperationSpec, ServiceClient } from "@azure/core-client";
import { PipelineRequest, PipelineResponse } from "@azure/core-client/node_modules/@azure/core-rest-pipeline";
import type { GeneralOptionalParams } from "./openapi/src";

/**
 * This solely exists because there is a bug in AutoRest: https://github.com/Azure/autorest.typescript/issues/1004
 */
export class FixedServiceClient implements Partial<ServiceClient> {
    private readonly innerClient: ServiceClient;
    public readonly $host: string|undefined;

    constructor(
        credentials: TokenCredential,
        $host: string,
        options?: GeneralOptionalParams
    ) {
        this.innerClient = new ServiceClient(options);
        this.$host = options?.baseUri;
    }

    get _baseUri() {
        return this.$host;
    }

    get _httpClient() {
        return this.innerClient["_httpClient"];
    }

    get pipeline() {
        return this.innerClient.pipeline;
    }

    async sendOperationRequest<T>(operationArguments: OperationArguments, operationSpec: OperationSpec): Promise<T> {
        return await this.innerClient.sendOperationRequest.bind(this)(
            operationArguments,
            operationSpec);
    }

    async sendRequest(request: PipelineRequest): Promise<PipelineResponse> {
        return await this.innerClient.sendRequest.bind(this)(request);
    }
}