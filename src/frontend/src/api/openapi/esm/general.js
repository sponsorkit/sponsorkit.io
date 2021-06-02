import { __extends } from "tslib";
import * as coreClient from "@azure/core-client";
import * as Parameters from "./models/parameters";
import * as Mappers from "./models/mappers";
import { GeneralContext } from "./generalContext";
var General = /** @class */ (function (_super) {
    __extends(General, _super);
    /**
     * Initializes a new instance of the General class.
     * @param credentials Subscription credentials which uniquely identify client subscription.
     * @param $host server parameter
     * @param options The parameter options
     */
    function General(credentials, $host, options) {
        return _super.call(this, credentials, $host, options) || this;
    }
    /** @param options The options parameters. */
    General.prototype.healthGet = function (options) {
        return this.sendOperationRequest({ options: options }, healthGetOperationSpec);
    };
    /**
     * @param beneficiaryId
     * @param options The options parameters.
     */
    General.prototype.apiSponsorsBeneficiaryIdGet = function (beneficiaryId, options) {
        return this.sendOperationRequest({ beneficiaryId: beneficiaryId, options: options }, apiSponsorsBeneficiaryIdGetOperationSpec);
    };
    /**
     * @param beneficiaryId
     * @param reference
     * @param options The options parameters.
     */
    General.prototype.apiSponsorsBeneficiaryIdReferencePost = function (beneficiaryId, reference, options) {
        return this.sendOperationRequest({ beneficiaryId: beneficiaryId, reference: reference, options: options }, apiSponsorsBeneficiaryIdReferencePostOperationSpec);
    };
    /**
     * @param beneficiaryId
     * @param reference
     * @param options The options parameters.
     */
    General.prototype.apiSponsorsBeneficiaryIdReferenceGet = function (beneficiaryId, reference, options) {
        return this.sendOperationRequest({ beneficiaryId: beneficiaryId, reference: reference, options: options }, apiSponsorsBeneficiaryIdReferenceGetOperationSpec);
    };
    /** @param options The options parameters. */
    General.prototype.apiSignupFromGithubPost = function (options) {
        return this.sendOperationRequest({ options: options }, apiSignupFromGithubPostOperationSpec);
    };
    /** @param options The options parameters. */
    General.prototype.apiSignupAsBeneficiaryPost = function (options) {
        return this.sendOperationRequest({ options: options }, apiSignupAsBeneficiaryPostOperationSpec);
    };
    /**
     * @param userId
     * @param options The options parameters.
     */
    General.prototype.apiSignupActivateStripeAccountUserIdGet = function (userId, options) {
        return this.sendOperationRequest({ userId: userId, options: options }, apiSignupActivateStripeAccountUserIdGetOperationSpec);
    };
    /**
     * @param beneficiaryId
     * @param reference
     * @param options The options parameters.
     */
    General.prototype.apiBrowserBeneficiaryIdReferenceGet = function (beneficiaryId, reference, options) {
        return this.sendOperationRequest({ beneficiaryId: beneficiaryId, reference: reference, options: options }, apiBrowserBeneficiaryIdReferenceGetOperationSpec);
    };
    return General;
}(GeneralContext));
export { General };
// Operation Specifications
var serializer = coreClient.createSerializer(Mappers, /* isXml */ false);
var healthGetOperationSpec = {
    path: "/health",
    httpMethod: "GET",
    responses: { 200: {} },
    urlParameters: [Parameters.$host],
    serializer: serializer
};
var apiSponsorsBeneficiaryIdGetOperationSpec = {
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
    serializer: serializer
};
var apiSponsorsBeneficiaryIdReferencePostOperationSpec = {
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
    serializer: serializer
};
var apiSponsorsBeneficiaryIdReferenceGetOperationSpec = {
    path: "/api/sponsors/{beneficiaryId}/{reference}",
    httpMethod: "GET",
    responses: {
        200: {
            bodyMapper: Mappers.SponsorkitDomainApiSponsorsBeneficiaryIdReferenceGetResponse
        }
    },
    urlParameters: [
        Parameters.$host,
        Parameters.beneficiaryId,
        Parameters.reference
    ],
    headerParameters: [Parameters.contentType, Parameters.accept],
    mediaType: "json",
    serializer: serializer
};
var apiSignupFromGithubPostOperationSpec = {
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
    serializer: serializer
};
var apiSignupAsBeneficiaryPostOperationSpec = {
    path: "/api/signup/as-beneficiary",
    httpMethod: "POST",
    responses: { 200: {} },
    urlParameters: [Parameters.$host],
    serializer: serializer
};
var apiSignupActivateStripeAccountUserIdGetOperationSpec = {
    path: "/api/signup/activate-stripe-account/{userId}",
    httpMethod: "GET",
    responses: { 200: {} },
    urlParameters: [Parameters.$host, Parameters.userId],
    headerParameters: [Parameters.contentType],
    mediaType: "json",
    serializer: serializer
};
var apiBrowserBeneficiaryIdReferenceGetOperationSpec = {
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
    serializer: serializer
};
//# sourceMappingURL=general.js.map