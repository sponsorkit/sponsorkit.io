import { SponsorkitDomainApiSponsorsBeneficiaryRequest as SponsorkitDomainApiSponsorsBeneficiaryRequestMapper, SponsorkitDomainApiSponsorsBeneficiaryIdReferencePostRequest as SponsorkitDomainApiSponsorsBeneficiaryIdReferencePostRequestMapper, SponsorkitDomainApiSponsorsBeneficiaryIdReferenceGetRequest as SponsorkitDomainApiSponsorsBeneficiaryIdReferenceGetRequestMapper, SponsorkitDomainApiSignupFromGitHubRequest as SponsorkitDomainApiSignupFromGitHubRequestMapper, SponsorkitDomainApiSignupActivateStripeAccountUserIdRequest as SponsorkitDomainApiSignupActivateStripeAccountUserIdRequestMapper, SponsorkitDomainApiBrowserBeneficiaryIdReferenceRequest as SponsorkitDomainApiBrowserBeneficiaryIdReferenceRequestMapper } from "../models/mappers";
export var $host = {
    parameterPath: "$host",
    mapper: {
        serializedName: "$host",
        required: true,
        type: {
            name: "String"
        }
    },
    skipEncoding: true
};
export var contentType = {
    parameterPath: ["options", "contentType"],
    mapper: {
        defaultValue: "application/json",
        isConstant: true,
        serializedName: "Content-Type",
        type: {
            name: "String"
        }
    }
};
export var body = {
    parameterPath: ["options", "body"],
    mapper: SponsorkitDomainApiSponsorsBeneficiaryRequestMapper
};
export var accept = {
    parameterPath: "accept",
    mapper: {
        defaultValue: "application/json, text/json",
        isConstant: true,
        serializedName: "Accept",
        type: {
            name: "String"
        }
    }
};
export var beneficiaryId = {
    parameterPath: "beneficiaryId",
    mapper: {
        serializedName: "beneficiaryId",
        required: true,
        type: {
            name: "String"
        }
    }
};
export var body1 = {
    parameterPath: ["options", "body"],
    mapper: SponsorkitDomainApiSponsorsBeneficiaryIdReferencePostRequestMapper
};
export var reference = {
    parameterPath: "reference",
    mapper: {
        serializedName: "reference",
        required: true,
        type: {
            name: "String"
        }
    }
};
export var body2 = {
    parameterPath: ["options", "body"],
    mapper: SponsorkitDomainApiSponsorsBeneficiaryIdReferenceGetRequestMapper
};
export var body3 = {
    parameterPath: ["options", "body"],
    mapper: SponsorkitDomainApiSignupFromGitHubRequestMapper
};
export var body4 = {
    parameterPath: ["options", "body"],
    mapper: SponsorkitDomainApiSignupActivateStripeAccountUserIdRequestMapper
};
export var userId = {
    parameterPath: "userId",
    mapper: {
        serializedName: "userId",
        required: true,
        type: {
            name: "String"
        }
    }
};
export var body5 = {
    parameterPath: ["options", "body"],
    mapper: SponsorkitDomainApiBrowserBeneficiaryIdReferenceRequestMapper
};
//# sourceMappingURL=parameters.js.map