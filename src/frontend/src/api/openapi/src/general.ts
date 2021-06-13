import * as coreHttp from "@azure/core-http";
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
  GeneralApiSignupAsSponsorPostOptionalParams,
  GeneralApiSignupAsBeneficiaryPostOptionalParams,
  GeneralApiSignupActivateStripeAccountUserIdGetOptionalParams,
  GeneralApiBrowserBeneficiaryIdReferenceGetOptionalParams,
  GeneralApiBountiesGetOptionalParams,
  GeneralApiBountiesGetResponse,
  GeneralApiBountiesGitHubIssueIdGetOptionalParams,
  GeneralApiBountiesGitHubIssueIdGetResponse,
  GeneralApiBountiesGitHubIssueIdPostOptionalParams,
  GeneralApiAccountGetOptionalParams,
  GeneralApiAccountGetResponse,
  GeneralApiAccountPaymentMethodIntentGetOptionalParams,
  GeneralApiAccountPaymentMethodIntentGetResponse,
  GeneralApiAccountPaymentMethodAvailabilityGetOptionalParams,
  GeneralApiAccountPaymentMethodAvailabilityGetResponse
} from "./models";

export class General extends GeneralContext {
  /**
   * Initializes a new instance of the General class.
   * @param credentials Subscription credentials which uniquely identify client subscription.
   * @param $host server parameter
   * @param options The parameter options
   */
  constructor(
    credentials: coreHttp.TokenCredential | coreHttp.ServiceClientCredentials,
    $host: string,
    options?: GeneralOptionalParams
  ) {
    super(credentials, $host, options);
  }

  /** @param options The options parameters. */
  healthGet(
    options?: GeneralHealthGetOptionalParams
  ): Promise<coreHttp.RestResponse> {
    const operationArguments: coreHttp.OperationArguments = {
      options: coreHttp.operationOptionsToRequestOptionsBase(options || {})
    };
    return this.sendOperationRequest(
      operationArguments,
      healthGetOperationSpec
    ) as Promise<coreHttp.RestResponse>;
  }

  /**
   * @param beneficiaryId
   * @param options The options parameters.
   */
  apiSponsorsBeneficiaryIdGet(
    beneficiaryId: string,
    options?: GeneralApiSponsorsBeneficiaryIdGetOptionalParams
  ): Promise<GeneralApiSponsorsBeneficiaryIdGetResponse> {
    const operationArguments: coreHttp.OperationArguments = {
      beneficiaryId,
      options: coreHttp.operationOptionsToRequestOptionsBase(options || {})
    };
    return this.sendOperationRequest(
      operationArguments,
      apiSponsorsBeneficiaryIdGetOperationSpec
    ) as Promise<GeneralApiSponsorsBeneficiaryIdGetResponse>;
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
  ): Promise<coreHttp.RestResponse> {
    const operationArguments: coreHttp.OperationArguments = {
      beneficiaryId,
      reference,
      options: coreHttp.operationOptionsToRequestOptionsBase(options || {})
    };
    return this.sendOperationRequest(
      operationArguments,
      apiSponsorsBeneficiaryIdReferencePostOperationSpec
    ) as Promise<coreHttp.RestResponse>;
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
    const operationArguments: coreHttp.OperationArguments = {
      beneficiaryId,
      reference,
      options: coreHttp.operationOptionsToRequestOptionsBase(options || {})
    };
    return this.sendOperationRequest(
      operationArguments,
      apiSponsorsBeneficiaryIdReferenceGetOperationSpec
    ) as Promise<GeneralApiSponsorsBeneficiaryIdReferenceGetResponse>;
  }

  /** @param options The options parameters. */
  apiSignupFromGithubPost(
    options?: GeneralApiSignupFromGithubPostOptionalParams
  ): Promise<GeneralApiSignupFromGithubPostResponse> {
    const operationArguments: coreHttp.OperationArguments = {
      options: coreHttp.operationOptionsToRequestOptionsBase(options || {})
    };
    return this.sendOperationRequest(
      operationArguments,
      apiSignupFromGithubPostOperationSpec
    ) as Promise<GeneralApiSignupFromGithubPostResponse>;
  }

  /** @param options The options parameters. */
  apiSignupAsSponsorPost(
    options?: GeneralApiSignupAsSponsorPostOptionalParams
  ): Promise<coreHttp.RestResponse> {
    const operationArguments: coreHttp.OperationArguments = {
      options: coreHttp.operationOptionsToRequestOptionsBase(options || {})
    };
    return this.sendOperationRequest(
      operationArguments,
      apiSignupAsSponsorPostOperationSpec
    ) as Promise<coreHttp.RestResponse>;
  }

  /** @param options The options parameters. */
  apiSignupAsBeneficiaryPost(
    options?: GeneralApiSignupAsBeneficiaryPostOptionalParams
  ): Promise<coreHttp.RestResponse> {
    const operationArguments: coreHttp.OperationArguments = {
      options: coreHttp.operationOptionsToRequestOptionsBase(options || {})
    };
    return this.sendOperationRequest(
      operationArguments,
      apiSignupAsBeneficiaryPostOperationSpec
    ) as Promise<coreHttp.RestResponse>;
  }

  /**
   * @param userId
   * @param options The options parameters.
   */
  apiSignupActivateStripeAccountUserIdGet(
    userId: string,
    options?: GeneralApiSignupActivateStripeAccountUserIdGetOptionalParams
  ): Promise<coreHttp.RestResponse> {
    const operationArguments: coreHttp.OperationArguments = {
      userId,
      options: coreHttp.operationOptionsToRequestOptionsBase(options || {})
    };
    return this.sendOperationRequest(
      operationArguments,
      apiSignupActivateStripeAccountUserIdGetOperationSpec
    ) as Promise<coreHttp.RestResponse>;
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
  ): Promise<coreHttp.RestResponse> {
    const operationArguments: coreHttp.OperationArguments = {
      beneficiaryId,
      reference,
      options: coreHttp.operationOptionsToRequestOptionsBase(options || {})
    };
    return this.sendOperationRequest(
      operationArguments,
      apiBrowserBeneficiaryIdReferenceGetOperationSpec
    ) as Promise<coreHttp.RestResponse>;
  }

  /** @param options The options parameters. */
  apiBountiesGet(
    options?: GeneralApiBountiesGetOptionalParams
  ): Promise<GeneralApiBountiesGetResponse> {
    const operationArguments: coreHttp.OperationArguments = {
      options: coreHttp.operationOptionsToRequestOptionsBase(options || {})
    };
    return this.sendOperationRequest(
      operationArguments,
      apiBountiesGetOperationSpec
    ) as Promise<GeneralApiBountiesGetResponse>;
  }

  /**
   * @param gitHubIssueId
   * @param options The options parameters.
   */
  apiBountiesGitHubIssueIdGet(
    gitHubIssueId: number,
    options?: GeneralApiBountiesGitHubIssueIdGetOptionalParams
  ): Promise<GeneralApiBountiesGitHubIssueIdGetResponse> {
    const operationArguments: coreHttp.OperationArguments = {
      gitHubIssueId,
      options: coreHttp.operationOptionsToRequestOptionsBase(options || {})
    };
    return this.sendOperationRequest(
      operationArguments,
      apiBountiesGitHubIssueIdGetOperationSpec
    ) as Promise<GeneralApiBountiesGitHubIssueIdGetResponse>;
  }

  /**
   * @param gitHubIssueId
   * @param options The options parameters.
   */
  apiBountiesGitHubIssueIdPost(
    gitHubIssueId: string,
    options?: GeneralApiBountiesGitHubIssueIdPostOptionalParams
  ): Promise<coreHttp.RestResponse> {
    const operationArguments: coreHttp.OperationArguments = {
      gitHubIssueId,
      options: coreHttp.operationOptionsToRequestOptionsBase(options || {})
    };
    return this.sendOperationRequest(
      operationArguments,
      apiBountiesGitHubIssueIdPostOperationSpec
    ) as Promise<coreHttp.RestResponse>;
  }

  /** @param options The options parameters. */
  apiAccountGet(
    options?: GeneralApiAccountGetOptionalParams
  ): Promise<GeneralApiAccountGetResponse> {
    const operationArguments: coreHttp.OperationArguments = {
      options: coreHttp.operationOptionsToRequestOptionsBase(options || {})
    };
    return this.sendOperationRequest(
      operationArguments,
      apiAccountGetOperationSpec
    ) as Promise<GeneralApiAccountGetResponse>;
  }

  /** @param options The options parameters. */
  apiAccountPaymentMethodIntentGet(
    options?: GeneralApiAccountPaymentMethodIntentGetOptionalParams
  ): Promise<GeneralApiAccountPaymentMethodIntentGetResponse> {
    const operationArguments: coreHttp.OperationArguments = {
      options: coreHttp.operationOptionsToRequestOptionsBase(options || {})
    };
    return this.sendOperationRequest(
      operationArguments,
      apiAccountPaymentMethodIntentGetOperationSpec
    ) as Promise<GeneralApiAccountPaymentMethodIntentGetResponse>;
  }

  /** @param options The options parameters. */
  apiAccountPaymentMethodAvailabilityGet(
    options?: GeneralApiAccountPaymentMethodAvailabilityGetOptionalParams
  ): Promise<GeneralApiAccountPaymentMethodAvailabilityGetResponse> {
    const operationArguments: coreHttp.OperationArguments = {
      options: coreHttp.operationOptionsToRequestOptionsBase(options || {})
    };
    return this.sendOperationRequest(
      operationArguments,
      apiAccountPaymentMethodAvailabilityGetOperationSpec
    ) as Promise<GeneralApiAccountPaymentMethodAvailabilityGetResponse>;
  }
}
// Operation Specifications
const serializer = new coreHttp.Serializer(Mappers, /* isXml */ false);

const healthGetOperationSpec: coreHttp.OperationSpec = {
  path: "/health",
  httpMethod: "GET",
  responses: { 200: {} },
  urlParameters: [Parameters.$host],
  serializer
};
const apiSponsorsBeneficiaryIdGetOperationSpec: coreHttp.OperationSpec = {
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
const apiSponsorsBeneficiaryIdReferencePostOperationSpec: coreHttp.OperationSpec = {
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
const apiSponsorsBeneficiaryIdReferenceGetOperationSpec: coreHttp.OperationSpec = {
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
const apiSignupFromGithubPostOperationSpec: coreHttp.OperationSpec = {
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
const apiSignupAsSponsorPostOperationSpec: coreHttp.OperationSpec = {
  path: "/api/signup/as-sponsor",
  httpMethod: "POST",
  responses: { 200: {} },
  requestBody: Parameters.body4,
  urlParameters: [Parameters.$host],
  headerParameters: [Parameters.contentType],
  mediaType: "json",
  serializer
};
const apiSignupAsBeneficiaryPostOperationSpec: coreHttp.OperationSpec = {
  path: "/api/signup/as-beneficiary",
  httpMethod: "POST",
  responses: { 200: {} },
  urlParameters: [Parameters.$host],
  serializer
};
const apiSignupActivateStripeAccountUserIdGetOperationSpec: coreHttp.OperationSpec = {
  path: "/api/signup/activate-stripe-account/{userId}",
  httpMethod: "GET",
  responses: { 200: {} },
  urlParameters: [Parameters.$host, Parameters.userId],
  headerParameters: [Parameters.contentType],
  mediaType: "json",
  serializer
};
const apiBrowserBeneficiaryIdReferenceGetOperationSpec: coreHttp.OperationSpec = {
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
const apiBountiesGetOperationSpec: coreHttp.OperationSpec = {
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
const apiBountiesGitHubIssueIdGetOperationSpec: coreHttp.OperationSpec = {
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
const apiBountiesGitHubIssueIdPostOperationSpec: coreHttp.OperationSpec = {
  path: "/api/bounties/{gitHubIssueId}",
  httpMethod: "POST",
  responses: { 200: {} },
  requestBody: Parameters.body7,
  urlParameters: [Parameters.$host, Parameters.gitHubIssueId1],
  headerParameters: [Parameters.contentType],
  mediaType: "json",
  serializer
};
const apiAccountGetOperationSpec: coreHttp.OperationSpec = {
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
const apiAccountPaymentMethodIntentGetOperationSpec: coreHttp.OperationSpec = {
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
const apiAccountPaymentMethodAvailabilityGetOperationSpec: coreHttp.OperationSpec = {
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
