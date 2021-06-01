import * as coreClient from "@azure/core-client";

export interface SponsorkitDomainApiSponsorsBeneficiaryRequest {
  beneficiaryId?: string;
}

export interface SponsorkitDomainApiSponsorsBeneficiaryResponse {
  id?: string;
  gitHubId?: number;
}

export interface SponsorkitDomainApiSponsorsBeneficiaryIdReferencePostRequest {
  beneficiaryId?: string;
  reference?: string;
  amountInHundreds?: number;
  email?: string;
  stripeCardId?: string;
}

export interface SponsorkitDomainApiSponsorsBeneficiaryIdReferenceGetRequest {
  beneficiaryId?: string;
  reference?: string;
}

export interface SponsorkitDomainApiSponsorsBeneficiaryIdReferenceGetResponse {
  donations?: SponsorkitDomainApiSponsorsBeneficiaryIdReferenceGetModelsDonationsResponse;
  sponsors?: SponsorkitDomainApiSponsorsBeneficiaryIdReferenceGetModelsSponsorSponsorsResponse;
}

export interface SponsorkitDomainApiSponsorsBeneficiaryIdReferenceGetModelsDonationsResponse {
  /** NOTE: This property will not be serialized. It can only be populated by the server. */
  readonly totalInHundreds?: number;
  /** NOTE: This property will not be serialized. It can only be populated by the server. */
  readonly monthlyInHundreds?: number;
}

export interface SponsorkitDomainApiSponsorsBeneficiaryIdReferenceGetModelsSponsorSponsorsResponse {
  current?: SponsorkitDomainApiSponsorsBeneficiaryIdReferenceGetModelsSponsorResponse;
  byAmount?: SponsorkitDomainApiSponsorsBeneficiaryIdReferenceGetModelsSponsorSponsorsByAmountResponse;
  byDate?: SponsorkitDomainApiSponsorsBeneficiaryIdReferenceGetModelsSponsorSponsorsByDateResponse;
}

export interface SponsorkitDomainApiSponsorsBeneficiaryIdReferenceGetModelsSponsorResponse {
  /** NOTE: This property will not be serialized. It can only be populated by the server. */
  readonly monthlyAmountInHundreds?: number;
  /** NOTE: This property will not be serialized. It can only be populated by the server. */
  readonly totalAmountInHundreds?: number;
  /** NOTE: This property will not be serialized. It can only be populated by the server. */
  readonly startedAtUtc?: Date;
}

export interface SponsorkitDomainApiSponsorsBeneficiaryIdReferenceGetModelsSponsorSponsorsByAmountResponse {
  /** NOTE: This property will not be serialized. It can only be populated by the server. */
  readonly most?: SponsorkitDomainApiSponsorsBeneficiaryIdReferenceGetModelsSponsorResponse[];
  /** NOTE: This property will not be serialized. It can only be populated by the server. */
  readonly least?: SponsorkitDomainApiSponsorsBeneficiaryIdReferenceGetModelsSponsorResponse[];
}

export interface SponsorkitDomainApiSponsorsBeneficiaryIdReferenceGetModelsSponsorSponsorsByDateResponse {
  /** NOTE: This property will not be serialized. It can only be populated by the server. */
  readonly latest?: SponsorkitDomainApiSponsorsBeneficiaryIdReferenceGetModelsSponsorResponse[];
  /** NOTE: This property will not be serialized. It can only be populated by the server. */
  readonly oldest?: SponsorkitDomainApiSponsorsBeneficiaryIdReferenceGetModelsSponsorResponse[];
}

export interface SponsorkitDomainApiSignupFromGitHubRequest {
  gitHubAuthenticationCode?: string;
}

export interface SponsorkitDomainApiSignupFromGitHubResponse {
  token?: string;
}

export interface SponsorkitDomainApiSignupActivateStripeAccountUserIdRequest {
  userId?: string;
}

export interface SponsorkitDomainApiBrowserBeneficiaryIdReferenceRequest {
  beneficiaryId?: string;
  reference?: string;
}

/** Optional parameters. */
export interface GeneralHealthGETOptionalParams
  extends coreClient.OperationOptions {}

/** Optional parameters. */
export interface GeneralApiSponsorsBeneficiaryIdGETOptionalParams
  extends coreClient.OperationOptions {
  body?: SponsorkitDomainApiSponsorsBeneficiaryRequest;
}

/** Contains response data for the apiSponsorsBeneficiaryIdGET operation. */
export type GeneralApiSponsorsBeneficiaryIdGETResponse = SponsorkitDomainApiSponsorsBeneficiaryResponse;

/** Optional parameters. */
export interface GeneralApiSponsorsBeneficiaryIdReferencePostOptionalParams
  extends coreClient.OperationOptions {
  body?: SponsorkitDomainApiSponsorsBeneficiaryIdReferencePostRequest;
}

/** Optional parameters. */
export interface GeneralApiSponsorsBeneficiaryIdReferenceGETOptionalParams
  extends coreClient.OperationOptions {
  body?: SponsorkitDomainApiSponsorsBeneficiaryIdReferenceGetRequest;
}

/** Contains response data for the apiSponsorsBeneficiaryIdReferenceGET operation. */
export type GeneralApiSponsorsBeneficiaryIdReferenceGETResponse = SponsorkitDomainApiSponsorsBeneficiaryIdReferenceGetResponse;

/** Optional parameters. */
export interface GeneralApiSignupFromGithubPostOptionalParams
  extends coreClient.OperationOptions {
  body?: SponsorkitDomainApiSignupFromGitHubRequest;
}

/** Contains response data for the apiSignupFromGithubPost operation. */
export type GeneralApiSignupFromGithubPostResponse = SponsorkitDomainApiSignupFromGitHubResponse;

/** Optional parameters. */
export interface GeneralApiSignupAsBeneficiaryPostOptionalParams
  extends coreClient.OperationOptions {}

/** Optional parameters. */
export interface GeneralApiSignupActivateStripeAccountUserIdGETOptionalParams
  extends coreClient.OperationOptions {
  body?: SponsorkitDomainApiSignupActivateStripeAccountUserIdRequest;
}

/** Optional parameters. */
export interface GeneralApiBrowserBeneficiaryIdReferenceGETOptionalParams
  extends coreClient.OperationOptions {
  body?: SponsorkitDomainApiBrowserBeneficiaryIdReferenceRequest;
}

/** Optional parameters. */
export interface GeneralOptionalParams extends coreClient.ServiceClientOptions {
  /** Overrides client endpoint. */
  endpoint?: string;
}
