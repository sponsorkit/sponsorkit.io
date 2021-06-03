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

export interface SponsorkitDomainApiSignupAsSponsorRequest {
  stripePaymentMethodId?: string;
}

export interface SponsorkitDomainApiSignupActivateStripeAccountUserIdRequest {
  userId?: string;
}

export interface SponsorkitDomainApiBrowserBeneficiaryIdReferenceRequest {
  beneficiaryId?: string;
  reference?: string;
}

export interface SponsorkitDomainApiBountiesByGitHubIssueRequest {
  issueId?: number;
}

export interface SponsorkitDomainApiBountiesByGitHubIssueResponse {
  bounties?: SponsorkitDomainApiBountiesByGitHubIssueBountyResponse[];
}

export interface SponsorkitDomainApiBountiesByGitHubIssueBountyResponse {
  amountInHundreds?: number;
  creatorUser?: SponsorkitDomainApiBountiesByGitHubIssueBountyUserResponse;
  awardedUser?: SponsorkitDomainApiBountiesByGitHubIssueBountyUserResponse;
}

export interface SponsorkitDomainApiBountiesByGitHubIssueBountyUserResponse {
  id?: number;
  gitHubUsername?: string;
}

export interface SponsorkitDomainApiAccountResponse {
  /** Any object */
  beneficiary?: any;
  /** Any object */
  sponsor?: any;
}

/** Optional parameters. */
export interface GeneralHealthGetOptionalParams
  extends coreClient.OperationOptions {}

/** Optional parameters. */
export interface GeneralApiSponsorsBeneficiaryIdGetOptionalParams
  extends coreClient.OperationOptions {
  body?: SponsorkitDomainApiSponsorsBeneficiaryRequest;
}

/** Contains response data for the apiSponsorsBeneficiaryIdGet operation. */
export type GeneralApiSponsorsBeneficiaryIdGetResponse = SponsorkitDomainApiSponsorsBeneficiaryResponse;

/** Optional parameters. */
export interface GeneralApiSponsorsBeneficiaryIdReferencePostOptionalParams
  extends coreClient.OperationOptions {
  body?: SponsorkitDomainApiSponsorsBeneficiaryIdReferencePostRequest;
}

/** Optional parameters. */
export interface GeneralApiSponsorsBeneficiaryIdReferenceGetOptionalParams
  extends coreClient.OperationOptions {
  body?: SponsorkitDomainApiSponsorsBeneficiaryIdReferenceGetRequest;
}

/** Contains response data for the apiSponsorsBeneficiaryIdReferenceGet operation. */
export type GeneralApiSponsorsBeneficiaryIdReferenceGetResponse = SponsorkitDomainApiSponsorsBeneficiaryIdReferenceGetResponse;

/** Optional parameters. */
export interface GeneralApiSignupFromGithubPostOptionalParams
  extends coreClient.OperationOptions {
  body?: SponsorkitDomainApiSignupFromGitHubRequest;
}

/** Contains response data for the apiSignupFromGithubPost operation. */
export type GeneralApiSignupFromGithubPostResponse = SponsorkitDomainApiSignupFromGitHubResponse;

/** Optional parameters. */
export interface GeneralApiSignupAsSponsorPostOptionalParams
  extends coreClient.OperationOptions {
  body?: SponsorkitDomainApiSignupAsSponsorRequest;
}

/** Optional parameters. */
export interface GeneralApiSignupAsBeneficiaryPostOptionalParams
  extends coreClient.OperationOptions {}

/** Optional parameters. */
export interface GeneralApiSignupActivateStripeAccountUserIdGetOptionalParams
  extends coreClient.OperationOptions {
  body?: SponsorkitDomainApiSignupActivateStripeAccountUserIdRequest;
}

/** Optional parameters. */
export interface GeneralApiBrowserBeneficiaryIdReferenceGetOptionalParams
  extends coreClient.OperationOptions {
  body?: SponsorkitDomainApiBrowserBeneficiaryIdReferenceRequest;
}

/** Optional parameters. */
export interface GeneralApiBountiesByGithubIssuePostOptionalParams
  extends coreClient.OperationOptions {
  body?: SponsorkitDomainApiBountiesByGitHubIssueRequest;
}

/** Contains response data for the apiBountiesByGithubIssuePost operation. */
export type GeneralApiBountiesByGithubIssuePostResponse = SponsorkitDomainApiBountiesByGitHubIssueResponse;

/** Optional parameters. */
export interface GeneralApiAccountGetOptionalParams
  extends coreClient.OperationOptions {}

/** Contains response data for the apiAccountGet operation. */
export type GeneralApiAccountGetResponse = SponsorkitDomainApiAccountResponse;

/** Optional parameters. */
export interface GeneralOptionalParams extends coreClient.ServiceClientOptions {
  /** Overrides client endpoint. */
  endpoint?: string;
}
