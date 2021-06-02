import * as coreAuth from '@azure/core-auth';
import * as coreClient from '@azure/core-client';

export declare class General extends GeneralContext {
    /**
     * Initializes a new instance of the General class.
     * @param credentials Subscription credentials which uniquely identify client subscription.
     * @param $host server parameter
     * @param options The parameter options
     */
    constructor(credentials: coreAuth.TokenCredential, $host: string, options?: GeneralOptionalParams);
    /** @param options The options parameters. */
    healthGet(options?: GeneralHealthGetOptionalParams): Promise<void>;
    /**
     * @param beneficiaryId
     * @param options The options parameters.
     */
    apiSponsorsBeneficiaryIdGet(beneficiaryId: string, options?: GeneralApiSponsorsBeneficiaryIdGetOptionalParams): Promise<GeneralApiSponsorsBeneficiaryIdGetResponse>;
    /**
     * @param beneficiaryId
     * @param reference
     * @param options The options parameters.
     */
    apiSponsorsBeneficiaryIdReferencePost(beneficiaryId: string, reference: string, options?: GeneralApiSponsorsBeneficiaryIdReferencePostOptionalParams): Promise<void>;
    /**
     * @param beneficiaryId
     * @param reference
     * @param options The options parameters.
     */
    apiSponsorsBeneficiaryIdReferenceGet(beneficiaryId: string, reference: string, options?: GeneralApiSponsorsBeneficiaryIdReferenceGetOptionalParams): Promise<GeneralApiSponsorsBeneficiaryIdReferenceGetResponse>;
    /** @param options The options parameters. */
    apiSignupFromGithubPost(options?: GeneralApiSignupFromGithubPostOptionalParams): Promise<GeneralApiSignupFromGithubPostResponse>;
    /** @param options The options parameters. */
    apiSignupAsBeneficiaryPost(options?: GeneralApiSignupAsBeneficiaryPostOptionalParams): Promise<void>;
    /**
     * @param userId
     * @param options The options parameters.
     */
    apiSignupActivateStripeAccountUserIdGet(userId: string, options?: GeneralApiSignupActivateStripeAccountUserIdGetOptionalParams): Promise<void>;
    /**
     * @param beneficiaryId
     * @param reference
     * @param options The options parameters.
     */
    apiBrowserBeneficiaryIdReferenceGet(beneficiaryId: string, reference: string, options?: GeneralApiBrowserBeneficiaryIdReferenceGetOptionalParams): Promise<void>;
}

/** Optional parameters. */
export declare interface GeneralApiBrowserBeneficiaryIdReferenceGetOptionalParams extends coreClient.OperationOptions {
    body?: SponsorkitDomainApiBrowserBeneficiaryIdReferenceRequest;
}

/** Optional parameters. */
export declare interface GeneralApiSignupActivateStripeAccountUserIdGetOptionalParams extends coreClient.OperationOptions {
    body?: SponsorkitDomainApiSignupActivateStripeAccountUserIdRequest;
}

/** Optional parameters. */
export declare interface GeneralApiSignupAsBeneficiaryPostOptionalParams extends coreClient.OperationOptions {
}

/** Optional parameters. */
export declare interface GeneralApiSignupFromGithubPostOptionalParams extends coreClient.OperationOptions {
    body?: SponsorkitDomainApiSignupFromGitHubRequest;
}

/** Contains response data for the apiSignupFromGithubPost operation. */
export declare type GeneralApiSignupFromGithubPostResponse = SponsorkitDomainApiSignupFromGitHubResponse;

/** Optional parameters. */
export declare interface GeneralApiSponsorsBeneficiaryIdGetOptionalParams extends coreClient.OperationOptions {
    body?: SponsorkitDomainApiSponsorsBeneficiaryRequest;
}

/** Contains response data for the apiSponsorsBeneficiaryIdGet operation. */
export declare type GeneralApiSponsorsBeneficiaryIdGetResponse = SponsorkitDomainApiSponsorsBeneficiaryResponse;

/** Optional parameters. */
export declare interface GeneralApiSponsorsBeneficiaryIdReferenceGetOptionalParams extends coreClient.OperationOptions {
    body?: SponsorkitDomainApiSponsorsBeneficiaryIdReferenceGetRequest;
}

/** Contains response data for the apiSponsorsBeneficiaryIdReferenceGet operation. */
export declare type GeneralApiSponsorsBeneficiaryIdReferenceGetResponse = SponsorkitDomainApiSponsorsBeneficiaryIdReferenceGetResponse;

/** Optional parameters. */
export declare interface GeneralApiSponsorsBeneficiaryIdReferencePostOptionalParams extends coreClient.OperationOptions {
    body?: SponsorkitDomainApiSponsorsBeneficiaryIdReferencePostRequest;
}

export declare class GeneralContext extends coreClient.ServiceClient {
    $host: string;
    /**
     * Initializes a new instance of the GeneralContext class.
     * @param credentials Subscription credentials which uniquely identify client subscription.
     * @param $host server parameter
     * @param options The parameter options
     */
    constructor(credentials: coreAuth.TokenCredential, $host: string, options?: GeneralOptionalParams);
}

/** Optional parameters. */
export declare interface GeneralHealthGetOptionalParams extends coreClient.OperationOptions {
}

/** Optional parameters. */
export declare interface GeneralOptionalParams extends coreClient.ServiceClientOptions {
    /** Overrides client endpoint. */
    endpoint?: string;
}

export declare interface SponsorkitDomainApiBrowserBeneficiaryIdReferenceRequest {
    beneficiaryId?: string;
    reference?: string;
}

export declare interface SponsorkitDomainApiSignupActivateStripeAccountUserIdRequest {
    userId?: string;
}

export declare interface SponsorkitDomainApiSignupFromGitHubRequest {
    gitHubAuthenticationCode?: string;
}

export declare interface SponsorkitDomainApiSignupFromGitHubResponse {
    token?: string;
}

export declare interface SponsorkitDomainApiSponsorsBeneficiaryIdReferenceGetModelsDonationsResponse {
    /** NOTE: This property will not be serialized. It can only be populated by the server. */
    readonly totalInHundreds?: number;
    /** NOTE: This property will not be serialized. It can only be populated by the server. */
    readonly monthlyInHundreds?: number;
}

export declare interface SponsorkitDomainApiSponsorsBeneficiaryIdReferenceGetModelsSponsorResponse {
    /** NOTE: This property will not be serialized. It can only be populated by the server. */
    readonly monthlyAmountInHundreds?: number;
    /** NOTE: This property will not be serialized. It can only be populated by the server. */
    readonly totalAmountInHundreds?: number;
    /** NOTE: This property will not be serialized. It can only be populated by the server. */
    readonly startedAtUtc?: Date;
}

export declare interface SponsorkitDomainApiSponsorsBeneficiaryIdReferenceGetModelsSponsorSponsorsByAmountResponse {
    /** NOTE: This property will not be serialized. It can only be populated by the server. */
    readonly most?: SponsorkitDomainApiSponsorsBeneficiaryIdReferenceGetModelsSponsorResponse[];
    /** NOTE: This property will not be serialized. It can only be populated by the server. */
    readonly least?: SponsorkitDomainApiSponsorsBeneficiaryIdReferenceGetModelsSponsorResponse[];
}

export declare interface SponsorkitDomainApiSponsorsBeneficiaryIdReferenceGetModelsSponsorSponsorsByDateResponse {
    /** NOTE: This property will not be serialized. It can only be populated by the server. */
    readonly latest?: SponsorkitDomainApiSponsorsBeneficiaryIdReferenceGetModelsSponsorResponse[];
    /** NOTE: This property will not be serialized. It can only be populated by the server. */
    readonly oldest?: SponsorkitDomainApiSponsorsBeneficiaryIdReferenceGetModelsSponsorResponse[];
}

export declare interface SponsorkitDomainApiSponsorsBeneficiaryIdReferenceGetModelsSponsorSponsorsResponse {
    current?: SponsorkitDomainApiSponsorsBeneficiaryIdReferenceGetModelsSponsorResponse;
    byAmount?: SponsorkitDomainApiSponsorsBeneficiaryIdReferenceGetModelsSponsorSponsorsByAmountResponse;
    byDate?: SponsorkitDomainApiSponsorsBeneficiaryIdReferenceGetModelsSponsorSponsorsByDateResponse;
}

export declare interface SponsorkitDomainApiSponsorsBeneficiaryIdReferenceGetRequest {
    beneficiaryId?: string;
    reference?: string;
}

export declare interface SponsorkitDomainApiSponsorsBeneficiaryIdReferenceGetResponse {
    donations?: SponsorkitDomainApiSponsorsBeneficiaryIdReferenceGetModelsDonationsResponse;
    sponsors?: SponsorkitDomainApiSponsorsBeneficiaryIdReferenceGetModelsSponsorSponsorsResponse;
}

export declare interface SponsorkitDomainApiSponsorsBeneficiaryIdReferencePostRequest {
    beneficiaryId?: string;
    reference?: string;
    amountInHundreds?: number;
    email?: string;
    stripeCardId?: string;
}

export declare interface SponsorkitDomainApiSponsorsBeneficiaryRequest {
    beneficiaryId?: string;
}

export declare interface SponsorkitDomainApiSponsorsBeneficiaryResponse {
    id?: string;
    gitHubId?: number;
}

export { }
