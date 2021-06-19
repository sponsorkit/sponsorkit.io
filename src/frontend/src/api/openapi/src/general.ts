import * as coreAuth from "@azure/core-auth";
import * as coreClient from "@azure/core-client";
import { FixedServiceClient } from "../../client";
import {
  GeneralApiAccountGetOptionalParams,
  GeneralApiAccountGetResponse, GeneralApiAccountPaymentMethodAvailabilityGetOptionalParams,
  GeneralApiAccountPaymentMethodAvailabilityGetResponse, GeneralApiAccountPaymentMethodIntentGetOptionalParams,
  GeneralApiAccountPaymentMethodIntentGetResponse, GeneralApiBountiesGetOptionalParams,
  GeneralApiBountiesGetResponse,
  GeneralApiBountiesGitHubIssueIdGetOptionalParams,
  GeneralApiBountiesGitHubIssueIdGetResponse,
  GeneralApiBountiesGitHubIssueIdPostOptionalParams, GeneralApiBrowserBeneficiaryIdReferenceGetOptionalParams, GeneralApiSignupActivateStripeAccountUserIdGetOptionalParams, GeneralApiSignupAsBeneficiaryPostOptionalParams, GeneralApiSignupAsSponsorPostOptionalParams, GeneralApiSignupFromGithubPostOptionalParams,
  GeneralApiSignupFromGithubPostResponse, GeneralApiSponsorsBeneficiaryIdGetOptionalParams,
  GeneralApiSponsorsBeneficiaryIdGetResponse, GeneralApiSponsorsBeneficiaryIdReferenceGetOptionalParams,
  GeneralApiSponsorsBeneficiaryIdReferenceGetResponse, GeneralApiSponsorsBeneficiaryIdReferencePostOptionalParams, GeneralHealthGetOptionalParams, GeneralOptionalParams
} from "./models";
import * as Mappers from "./models/mappers";
import * as Parameters from "./models/parameters";

export class General extends FixedServiceClient {
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
  apiSignupAsSponsorPost(
    options?: GeneralApiSignupAsSponsorPostOptionalParams
  ): Promise<void> {
    return this.sendOperationRequest(
      { options },
      apiSignupAsSponsorPostOperationSpec
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

  /** @param options The options parameters. */
  apiBountiesGet(
    options?: GeneralApiBountiesGetOptionalParams
  ): Promise<GeneralApiBountiesGetResponse> {
    return this.sendOperationRequest({ options }, apiBountiesGetOperationSpec);
  }

  /**
   * @param gitHubIssueId
   * @param options The options parameters.
   */
  apiBountiesGitHubIssueIdGet(
    gitHubIssueId: number,
    options?: GeneralApiBountiesGitHubIssueIdGetOptionalParams
  ): Promise<GeneralApiBountiesGitHubIssueIdGetResponse> {
    return this.sendOperationRequest(
      { gitHubIssueId, options },
      apiBountiesGitHubIssueIdGetOperationSpec
    );
  }

  /**
   * @param gitHubIssueId
   * @param options The options parameters.
   */
  apiBountiesGitHubIssueIdPost(
    gitHubIssueId: string,
    options?: GeneralApiBountiesGitHubIssueIdPostOptionalParams
  ): Promise<void> {
    return this.sendOperationRequest(
      { gitHubIssueId, options },
      apiBountiesGitHubIssueIdPostOperationSpec
    );
  }

  /** @param options The options parameters. */
  apiAccountGet(
    options?: GeneralApiAccountGetOptionalParams
  ): Promise<GeneralApiAccountGetResponse> {
    return this.sendOperationRequest({ options }, apiAccountGetOperationSpec);
  }

  /** @param options The options parameters. */
  apiAccountPaymentMethodIntentGet(
    options?: GeneralApiAccountPaymentMethodIntentGetOptionalParams
  ): Promise<GeneralApiAccountPaymentMethodIntentGetResponse> {
    return this.sendOperationRequest(
      { options },
      apiAccountPaymentMethodIntentGetOperationSpec
    );
  }

  /** @param options The options parameters. */
  apiAccountPaymentMethodAvailabilityGet(
    options?: GeneralApiAccountPaymentMethodAvailabilityGetOptionalParams
  ): Promise<GeneralApiAccountPaymentMethodAvailabilityGetResponse> {
    return this.sendOperationRequest(
      { options },
      apiAccountPaymentMethodAvailabilityGetOperationSpec
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
const apiSignupAsSponsorPostOperationSpec: coreClient.OperationSpec = {
  path: "/api/signup/as-sponsor",
  httpMethod: "POST",
  responses: { 200: {} },
  requestBody: Parameters.body4,
  urlParameters: [Parameters.$host],
  headerParameters: [Parameters.contentType],
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
const apiBountiesGetOperationSpec: coreClient.OperationSpec = {
  path: "/api/bounties",
  httpMethod: "GET",
  responses: {
    200: {
      bodyMapper: Mappers.SponsorkitDomainApiBountiesResponse
    }
  },
  urlParameters: [Parameters.$host],
  headerParameters: [Parameters.accept],
  serializer
};
const apiBountiesGitHubIssueIdGetOperationSpec: coreClient.OperationSpec = {
  path: "/api/bounties/{gitHubIssueId}",
  httpMethod: "GET",
  responses: {
    200: {
      bodyMapper: Mappers.SponsorkitDomainApiBountiesGitHubIssueIdGetResponse
    }
  },
  urlParameters: [Parameters.$host, Parameters.gitHubIssueId],
  headerParameters: [Parameters.accept],
  serializer
};
const apiBountiesGitHubIssueIdPostOperationSpec: coreClient.OperationSpec = {
  path: "/api/bounties/{gitHubIssueId}",
  httpMethod: "POST",
  responses: { 200: {} },
  requestBody: Parameters.body7,
  urlParameters: [Parameters.$host, Parameters.gitHubIssueId1],
  headerParameters: [Parameters.contentType],
  mediaType: "json",
  serializer
};
const apiAccountGetOperationSpec: coreClient.OperationSpec = {
  path: "/api/account",
  httpMethod: "GET",
  responses: {
    200: {
      bodyMapper: Mappers.SponsorkitDomainApiAccountResponse
    }
  },
  urlParameters: [Parameters.$host],
  headerParameters: [Parameters.accept],
  serializer
};
const apiAccountPaymentMethodIntentGetOperationSpec: coreClient.OperationSpec = {
  path: "/api/account/payment-method/intent",
  httpMethod: "GET",
  responses: {
    200: {
      bodyMapper: Mappers.SponsorkitDomainApiAccountPaymentMethodIntentResponse
    }
  },
  urlParameters: [Parameters.$host],
  headerParameters: [Parameters.accept],
  serializer
};
const apiAccountPaymentMethodAvailabilityGetOperationSpec: coreClient.OperationSpec = {
  path: "/api/account/payment-method/availability",
  httpMethod: "GET",
  responses: {
    200: {
      bodyMapper:
        Mappers.SponsorkitDomainApiAccountPaymentMethodAvailabilityResponse
    }
  },
  urlParameters: [Parameters.$host],
  headerParameters: [Parameters.accept],
  serializer
};
