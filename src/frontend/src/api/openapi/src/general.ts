import * as coreClient from "@azure/core-client";
import * as coreAuth from "@azure/core-auth";
import * as Parameters from "./models/parameters";
import * as Mappers from "./models/mappers";
import { GeneralContext } from "./generalContext";
import {
  GeneralOptionalParams,
  GeneralHealthGetOptionalParams,
  GeneralApiSponsorsBeneficiaryIdGetOptionalParams,
  GeneralApiSponsorsBeneficiaryIdGetResponse,
  GeneralApiSponsorsBeneficiaryIdReferencePostOptionalParams,
  GeneralApiSponsorsBeneficiaryIdReferenceGetOptionalParams,
  GeneralApiSponsorsBeneficiaryIdReferenceGetResponse,
  GeneralApiSignupFromGithubPostOptionalParams,
  GeneralApiSignupFromGithubPostResponse,
  GeneralApiSignupAsBeneficiaryPostOptionalParams,
  GeneralApiSignupActivateStripeAccountUserIdGetOptionalParams,
  GeneralApiBrowserBeneficiaryIdReferenceGetOptionalParams
} from "./models";

export class General extends GeneralContext {
  /**
   * Initializes a new instance of the General class.
   * @param credentials Subscription credentials which uniquely identify client subscription.
   * @param $host server parameter
   * @param options The parameter options
   */
  constructor(
    credentials: coreAuth.TokenCredential,
    $host: string,
    options?: GeneralOptionalParams
  ) {
    super(credentials, $host, options);
  }

  /** @param options The options parameters. */
  healthGet(options?: GeneralHealthGetOptionalParams): Promise<void> {
    return this.sendOperationRequest({ options }, healthGetOperationSpec);
  }

  /**
   * @param beneficiaryId
   * @param options The options parameters.
   */
  apiSponsorsBeneficiaryIdGet(
    beneficiaryId: string,
    options?: GeneralApiSponsorsBeneficiaryIdGetOptionalParams
  ): Promise<GeneralApiSponsorsBeneficiaryIdGetResponse> {
    return this.sendOperationRequest(
      { beneficiaryId, options },
      apiSponsorsBeneficiaryIdGetOperationSpec
    );
  }

  /**
   * @param beneficiaryId
   * @param reference
   * @param options The options parameters.
   */
  apiSponsorsBeneficiaryIdReferencePost(
    beneficiaryId: string,
    reference: string,
    options?: GeneralApiSponsorsBeneficiaryIdReferencePostOptionalParams
  ): Promise<void> {
    return this.sendOperationRequest(
      { beneficiaryId, reference, options },
      apiSponsorsBeneficiaryIdReferencePostOperationSpec
    );
  }

  /**
   * @param beneficiaryId
   * @param reference
   * @param options The options parameters.
   */
  apiSponsorsBeneficiaryIdReferenceGet(
    beneficiaryId: string,
    reference: string,
    options?: GeneralApiSponsorsBeneficiaryIdReferenceGetOptionalParams
  ): Promise<GeneralApiSponsorsBeneficiaryIdReferenceGetResponse> {
    return this.sendOperationRequest(
      { beneficiaryId, reference, options },
      apiSponsorsBeneficiaryIdReferenceGetOperationSpec
    );
  }

  /** @param options The options parameters. */
  apiSignupFromGithubPost(
    options?: GeneralApiSignupFromGithubPostOptionalParams
  ): Promise<GeneralApiSignupFromGithubPostResponse> {
    return this.sendOperationRequest(
      { options },
      apiSignupFromGithubPostOperationSpec
    );
  }

  /** @param options The options parameters. */
  apiSignupAsBeneficiaryPost(
    options?: GeneralApiSignupAsBeneficiaryPostOptionalParams
  ): Promise<void> {
    return this.sendOperationRequest(
      { options },
      apiSignupAsBeneficiaryPostOperationSpec
    );
  }

  /**
   * @param userId
   * @param options The options parameters.
   */
  apiSignupActivateStripeAccountUserIdGet(
    userId: string,
    options?: GeneralApiSignupActivateStripeAccountUserIdGetOptionalParams
  ): Promise<void> {
    return this.sendOperationRequest(
      { userId, options },
      apiSignupActivateStripeAccountUserIdGetOperationSpec
    );
  }

  /**
   * @param beneficiaryId
   * @param reference
   * @param options The options parameters.
   */
  apiBrowserBeneficiaryIdReferenceGet(
    beneficiaryId: string,
    reference: string,
    options?: GeneralApiBrowserBeneficiaryIdReferenceGetOptionalParams
  ): Promise<void> {
    return this.sendOperationRequest(
      { beneficiaryId, reference, options },
      apiBrowserBeneficiaryIdReferenceGetOperationSpec
    );
  }
}
// Operation Specifications
const serializer = coreClient.createSerializer(Mappers, /* isXml */ false);

const healthGetOperationSpec: coreClient.OperationSpec = {
  path: "/health",
  httpMethod: "GET",
  responses: { 200: {} },
  urlParameters: [Parameters.$host],
  serializer
};
const apiSponsorsBeneficiaryIdGetOperationSpec: coreClient.OperationSpec = {
  path: "/api/sponsors/{beneficiaryId}",
  httpMethod: "GET",
  responses: {
    200: {
      bodyMapper: Mappers.SponsorkitDomainApiSponsorsBeneficiaryResponse
    }
  },
  urlParameters: [Parameters.$host, Parameters.beneficiaryId],
  headerParameters: [Parameters.contentType, Parameters.accept],
  mediaType: "json",
  serializer
};
const apiSponsorsBeneficiaryIdReferencePostOperationSpec: coreClient.OperationSpec = {
  path: "/api/sponsors/{beneficiaryId}/{reference}",
  httpMethod: "POST",
  responses: { 200: {} },
  requestBody: Parameters.body1,
  urlParameters: [
    Parameters.$host,
    Parameters.beneficiaryId,
    Parameters.reference
  ],
  headerParameters: [Parameters.contentType],
  mediaType: "json",
  serializer
};
const apiSponsorsBeneficiaryIdReferenceGetOperationSpec: coreClient.OperationSpec = {
  path: "/api/sponsors/{beneficiaryId}/{reference}",
  httpMethod: "GET",
  responses: {
    200: {
      bodyMapper:
        Mappers.SponsorkitDomainApiSponsorsBeneficiaryIdReferenceGetResponse
    }
  },
  urlParameters: [
    Parameters.$host,
    Parameters.beneficiaryId,
    Parameters.reference
  ],
  headerParameters: [Parameters.contentType, Parameters.accept],
  mediaType: "json",
  serializer
};
const apiSignupFromGithubPostOperationSpec: coreClient.OperationSpec = {
  path: "/api/signup/from-github",
  httpMethod: "POST",
  responses: {
    200: {
      bodyMapper: Mappers.SponsorkitDomainApiSignupFromGitHubResponse
    }
  },
  requestBody: Parameters.body3,
  urlParameters: [Parameters.$host],
  headerParameters: [Parameters.contentType, Parameters.accept],
  mediaType: "json",
  serializer
};
const apiSignupAsBeneficiaryPostOperationSpec: coreClient.OperationSpec = {
  path: "/api/signup/as-beneficiary",
  httpMethod: "POST",
  responses: { 200: {} },
  urlParameters: [Parameters.$host],
  serializer
};
const apiSignupActivateStripeAccountUserIdGetOperationSpec: coreClient.OperationSpec = {
  path: "/api/signup/activate-stripe-account/{userId}",
  httpMethod: "GET",
  responses: { 200: {} },
  urlParameters: [Parameters.$host, Parameters.userId],
  headerParameters: [Parameters.contentType],
  mediaType: "json",
  serializer
};
const apiBrowserBeneficiaryIdReferenceGetOperationSpec: coreClient.OperationSpec = {
  path: "/api/browser/{beneficiaryId}/{reference}",
  httpMethod: "GET",
  responses: { 200: {} },
  urlParameters: [
    Parameters.$host,
    Parameters.beneficiaryId,
    Parameters.reference
  ],
  headerParameters: [Parameters.contentType],
  mediaType: "json",
  serializer
};
