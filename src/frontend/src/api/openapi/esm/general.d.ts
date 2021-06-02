import * as coreAuth from "@azure/core-auth";
import { GeneralContext } from "./generalContext";
import { GeneralOptionalParams, GeneralHealthGetOptionalParams, GeneralApiSponsorsBeneficiaryIdGetOptionalParams, GeneralApiSponsorsBeneficiaryIdGetResponse, GeneralApiSponsorsBeneficiaryIdReferencePostOptionalParams, GeneralApiSponsorsBeneficiaryIdReferenceGetOptionalParams, GeneralApiSponsorsBeneficiaryIdReferenceGetResponse, GeneralApiSignupFromGithubPostOptionalParams, GeneralApiSignupFromGithubPostResponse, GeneralApiSignupAsBeneficiaryPostOptionalParams, GeneralApiSignupActivateStripeAccountUserIdGetOptionalParams, GeneralApiBrowserBeneficiaryIdReferenceGetOptionalParams } from "./models";
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
//# sourceMappingURL=general.d.ts.map