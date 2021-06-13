import * as coreHttp from "@azure/core-http";

export interface SponsorkitDomainApiSponsorsBeneficiaryRequest {
  beneficiaryId: string;
}

export interface SponsorkitDomainApiSponsorsBeneficiaryResponse {
  id: string;
  gitHubId?: number;
}

export interface SponsorkitDomainApiSponsorsBeneficiaryIdReferencePostRequest {
  beneficiaryId: string;
  reference: string;
  amountInHundreds?: number;
  email?: string;
  stripeCardId?: string;
}

export interface SponsorkitDomainApiSponsorsBeneficiaryIdReferenceGetRequest {
  beneficiaryId: string;
  reference: string;
}

export interface SponsorkitDomainApiSponsorsBeneficiaryIdReferenceGetResponse {
  donations: SponsorkitDomainApiSponsorsBeneficiaryIdReferenceGetModelsDonationsResponse;
  sponsors: SponsorkitDomainApiSponsorsBeneficiaryIdReferenceGetModelsSponsorSponsorsResponse;
}

export interface SponsorkitDomainApiSponsorsBeneficiaryIdReferenceGetModelsDonationsResponse {
  /** NOTE: This property will not be serialized. It can only be populated by the server. */
  readonly totalInHundreds: number;
  /** NOTE: This property will not be serialized. It can only be populated by the server. */
  readonly monthlyInHundreds: number;
}

export interface SponsorkitDomainApiSponsorsBeneficiaryIdReferenceGetModelsSponsorSponsorsResponse {
  current?: SponsorkitDomainApiSponsorsBeneficiaryIdReferenceGetModelsSponsorResponse;
  byAmount: SponsorkitDomainApiSponsorsBeneficiaryIdReferenceGetModelsSponsorSponsorsByAmountResponse;
  byDate: SponsorkitDomainApiSponsorsBeneficiaryIdReferenceGetModelsSponsorSponsorsByDateResponse;
}

export interface SponsorkitDomainApiSponsorsBeneficiaryIdReferenceGetModelsSponsorResponse {
  /** NOTE: This property will not be serialized. It can only be populated by the server. */
  readonly monthlyAmountInHundreds?: number;
  /** NOTE: This property will not be serialized. It can only be populated by the server. */
  readonly totalAmountInHundreds: number;
  /** NOTE: This property will not be serialized. It can only be populated by the server. */
  readonly startedAtUtc: Date;
}

export interface SponsorkitDomainApiSponsorsBeneficiaryIdReferenceGetModelsSponsorSponsorsByAmountResponse {
  /** NOTE: This property will not be serialized. It can only be populated by the server. */
  readonly most: SponsorkitDomainApiSponsorsBeneficiaryIdReferenceGetModelsSponsorResponse[];
  /** NOTE: This property will not be serialized. It can only be populated by the server. */
  readonly least: SponsorkitDomainApiSponsorsBeneficiaryIdReferenceGetModelsSponsorResponse[];
}

export interface SponsorkitDomainApiSponsorsBeneficiaryIdReferenceGetModelsSponsorSponsorsByDateResponse {
  /** NOTE: This property will not be serialized. It can only be populated by the server. */
  readonly latest: SponsorkitDomainApiSponsorsBeneficiaryIdReferenceGetModelsSponsorResponse[];
  /** NOTE: This property will not be serialized. It can only be populated by the server. */
  readonly oldest: SponsorkitDomainApiSponsorsBeneficiaryIdReferenceGetModelsSponsorResponse[];
}

export interface SponsorkitDomainApiSignupFromGitHubRequest {
  gitHubAuthenticationCode: string;
}

export interface SponsorkitDomainApiSignupFromGitHubResponse {
  token: string;
}

export interface SponsorkitDomainApiSignupAsSponsorRequest {
  stripePaymentMethodId: string;
}

export interface SponsorkitDomainApiSignupActivateStripeAccountUserIdRequest {
  userId: string;
}

export interface SponsorkitDomainApiBrowserBeneficiaryIdReferenceRequest {
  beneficiaryId: string;
  reference: string;
}

export interface SponsorkitDomainApiBountiesResponse {
  bounties: SponsorkitDomainApiBountiesBountyResponse[];
}

export interface SponsorkitDomainApiBountiesBountyResponse {
  amountInHundreds: number;
  gitHubIssueId: number;
  bountyCount: number;
}

export interface SponsorkitDomainApiBountiesGitHubIssueIdGetResponse {
  bounties: SponsorkitDomainApiBountiesGitHubIssueIdBountyResponse[];
}

export interface SponsorkitDomainApiBountiesGitHubIssueIdBountyResponse {
  amountInHundreds: number;
  createdAtUtc: Date;
  creatorUser: SponsorkitDomainApiBountiesGitHubIssueIdBountyUserResponse;
  awardedUser?: SponsorkitDomainApiBountiesGitHubIssueIdBountyUserResponse;
}

export interface SponsorkitDomainApiBountiesGitHubIssueIdBountyUserResponse {
  id: number;
  gitHubUsername: string;
}

export interface SponsorkitDomainApiBountiesGitHubIssueIdPostRequest {
  gitHubIssueId: number;
  amountInHundreds: number;
}

export interface SponsorkitDomainApiAccountResponse {
  /** Any object */
  beneficiary?: any;
  /** Any object */
  sponsor?: any;
}

export interface SponsorkitDomainApiAccountPaymentMethodIntentResponse {
  setupIntentClientSecret: string;
}

export interface SponsorkitDomainApiAccountPaymentMethodAvailabilityResponse {
  availability?: PaymentMethodAvailability;
}

/** Defines values for PaymentMethodAvailability. */
export type PaymentMethodAvailability = "notAvailable" | "available";

/** Optional parameters. */
export interface GeneralHealthGetOptionalParams
  extends coreHttp.OperationOptions {}

/** Optional parameters. */
export interface GeneralApiSponsorsBeneficiaryIdGetOptionalParams
  extends coreHttp.OperationOptions {
  body?: SponsorkitDomainApiSponsorsBeneficiaryRequest;
}

/** Contains response data for the apiSponsorsBeneficiaryIdGet operation. */
export type GeneralApiSponsorsBeneficiaryIdGetResponse = SponsorkitDomainApiSponsorsBeneficiaryResponse & {
  /** The underlying HTTP response. */
  _response: coreHttp.HttpResponse & {
    /** The response body as text (string format) */
    bodyAsText: string;

    /** The response body as parsed JSON or XML */
    parsedBody: SponsorkitDomainApiSponsorsBeneficiaryResponse;
  };
};

/** Optional parameters. */
export interface GeneralApiSponsorsBeneficiaryIdReferencePostOptionalParams
  extends coreHttp.OperationOptions {
  body?: SponsorkitDomainApiSponsorsBeneficiaryIdReferencePostRequest;
}

/** Optional parameters. */
export interface GeneralApiSponsorsBeneficiaryIdReferenceGetOptionalParams
  extends coreHttp.OperationOptions {
  body?: SponsorkitDomainApiSponsorsBeneficiaryIdReferenceGetRequest;
}

/** Contains response data for the apiSponsorsBeneficiaryIdReferenceGet operation. */
export type GeneralApiSponsorsBeneficiaryIdReferenceGetResponse = SponsorkitDomainApiSponsorsBeneficiaryIdReferenceGetResponse & {
  /** The underlying HTTP response. */
  _response: coreHttp.HttpResponse & {
    /** The response body as text (string format) */
    bodyAsText: string;

    /** The response body as parsed JSON or XML */
    parsedBody: SponsorkitDomainApiSponsorsBeneficiaryIdReferenceGetResponse;
  };
};

/** Optional parameters. */
export interface GeneralApiSignupFromGithubPostOptionalParams
  extends coreHttp.OperationOptions {
  body?: SponsorkitDomainApiSignupFromGitHubRequest;
}

/** Contains response data for the apiSignupFromGithubPost operation. */
export type GeneralApiSignupFromGithubPostResponse = SponsorkitDomainApiSignupFromGitHubResponse & {
  /** The underlying HTTP response. */
  _response: coreHttp.HttpResponse & {
    /** The response body as text (string format) */
    bodyAsText: string;

    /** The response body as parsed JSON or XML */
    parsedBody: SponsorkitDomainApiSignupFromGitHubResponse;
  };
};

/** Optional parameters. */
export interface GeneralApiSignupAsSponsorPostOptionalParams
  extends coreHttp.OperationOptions {
  body?: SponsorkitDomainApiSignupAsSponsorRequest;
}

/** Optional parameters. */
export interface GeneralApiSignupAsBeneficiaryPostOptionalParams
  extends coreHttp.OperationOptions {}

/** Optional parameters. */
export interface GeneralApiSignupActivateStripeAccountUserIdGetOptionalParams
  extends coreHttp.OperationOptions {
  body?: SponsorkitDomainApiSignupActivateStripeAccountUserIdRequest;
}

/** Optional parameters. */
export interface GeneralApiBrowserBeneficiaryIdReferenceGetOptionalParams
  extends coreHttp.OperationOptions {
  body?: SponsorkitDomainApiBrowserBeneficiaryIdReferenceRequest;
}

/** Optional parameters. */
export interface GeneralApiBountiesGetOptionalParams
  extends coreHttp.OperationOptions {}

/** Contains response data for the apiBountiesGet operation. */
export type GeneralApiBountiesGetResponse = SponsorkitDomainApiBountiesResponse & {
  /** The underlying HTTP response. */
  _response: coreHttp.HttpResponse & {
    /** The response body as text (string format) */
    bodyAsText: string;

    /** The response body as parsed JSON or XML */
    parsedBody: SponsorkitDomainApiBountiesResponse;
  };
};

/** Optional parameters. */
export interface GeneralApiBountiesGitHubIssueIdGetOptionalParams
  extends coreHttp.OperationOptions {}

/** Contains response data for the apiBountiesGitHubIssueIdGet operation. */
export type GeneralApiBountiesGitHubIssueIdGetResponse = SponsorkitDomainApiBountiesGitHubIssueIdGetResponse & {
  /** The underlying HTTP response. */
  _response: coreHttp.HttpResponse & {
    /** The response body as text (string format) */
    bodyAsText: string;

    /** The response body as parsed JSON or XML */
    parsedBody: SponsorkitDomainApiBountiesGitHubIssueIdGetResponse;
  };
};

/** Optional parameters. */
export interface GeneralApiBountiesGitHubIssueIdPostOptionalParams
  extends coreHttp.OperationOptions {
  body?: SponsorkitDomainApiBountiesGitHubIssueIdPostRequest;
}

/** Optional parameters. */
export interface GeneralApiAccountGetOptionalParams
  extends coreHttp.OperationOptions {}

/** Contains response data for the apiAccountGet operation. */
export type GeneralApiAccountGetResponse = SponsorkitDomainApiAccountResponse & {
  /** The underlying HTTP response. */
  _response: coreHttp.HttpResponse & {
    /** The response body as text (string format) */
    bodyAsText: string;

    /** The response body as parsed JSON or XML */
    parsedBody: SponsorkitDomainApiAccountResponse;
  };
};

/** Optional parameters. */
export interface GeneralApiAccountPaymentMethodIntentGetOptionalParams
  extends coreHttp.OperationOptions {}

/** Contains response data for the apiAccountPaymentMethodIntentGet operation. */
export type GeneralApiAccountPaymentMethodIntentGetResponse = SponsorkitDomainApiAccountPaymentMethodIntentResponse & {
  /** The underlying HTTP response. */
  _response: coreHttp.HttpResponse & {
    /** The response body as text (string format) */
    bodyAsText: string;

    /** The response body as parsed JSON or XML */
    parsedBody: SponsorkitDomainApiAccountPaymentMethodIntentResponse;
  };
};

/** Optional parameters. */
export interface GeneralApiAccountPaymentMethodAvailabilityGetOptionalParams
  extends coreHttp.OperationOptions {}

/** Contains response data for the apiAccountPaymentMethodAvailabilityGet operation. */
export type GeneralApiAccountPaymentMethodAvailabilityGetResponse = SponsorkitDomainApiAccountPaymentMethodAvailabilityResponse & {
  /** The underlying HTTP response. */
  _response: coreHttp.HttpResponse & {
    /** The response body as text (string format) */
    bodyAsText: string;

    /** The response body as parsed JSON or XML */
    parsedBody: SponsorkitDomainApiAccountPaymentMethodAvailabilityResponse;
  };
};

/** Optional parameters. */
export interface GeneralOptionalParams extends coreHttp.ServiceClientOptions {
  /** Overrides client endpoint. */
  endpoint?: string;
}
