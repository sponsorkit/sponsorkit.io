import { OperationURLParameter, OperationParameter } from "@azure/core-client";
import {
  SponsorkitDomainApiSponsorsBeneficiaryRequest as SponsorkitDomainApiSponsorsBeneficiaryRequestMapper,
  SponsorkitDomainApiSponsorsBeneficiaryIdReferencePostRequest as SponsorkitDomainApiSponsorsBeneficiaryIdReferencePostRequestMapper,
  SponsorkitDomainApiSponsorsBeneficiaryIdReferenceGetRequest as SponsorkitDomainApiSponsorsBeneficiaryIdReferenceGetRequestMapper,
  SponsorkitDomainApiSignupFromGitHubRequest as SponsorkitDomainApiSignupFromGitHubRequestMapper,
  SponsorkitDomainApiSignupAsSponsorRequest as SponsorkitDomainApiSignupAsSponsorRequestMapper,
  SponsorkitDomainApiSignupActivateStripeAccountUserIdRequest as SponsorkitDomainApiSignupActivateStripeAccountUserIdRequestMapper,
  SponsorkitDomainApiBrowserBeneficiaryIdReferenceRequest as SponsorkitDomainApiBrowserBeneficiaryIdReferenceRequestMapper,
  SponsorkitDomainApiBountiesIntentRequest as SponsorkitDomainApiBountiesIntentRequestMapper,
  SponsorkitDomainApiBountiesIntentPostRequest as SponsorkitDomainApiBountiesIntentPostRequestMapper,
  SponsorkitDomainApiBountiesGitHubIssueIdGetRequest as SponsorkitDomainApiBountiesGitHubIssueIdGetRequestMapper
} from "../models/mappers";

export const $host: OperationURLParameter = {
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

export const contentType: OperationParameter = {
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

export const body: OperationParameter = {
  parameterPath: ["options", "body"],
  mapper: SponsorkitDomainApiSponsorsBeneficiaryRequestMapper
};

export const accept: OperationParameter = {
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

export const beneficiaryId: OperationURLParameter = {
  parameterPath: "beneficiaryId",
  mapper: {
    serializedName: "beneficiaryId",
    required: true,
    type: {
      name: "String"
    }
  }
};

export const body1: OperationParameter = {
  parameterPath: ["options", "body"],
  mapper: SponsorkitDomainApiSponsorsBeneficiaryIdReferencePostRequestMapper
};

export const reference: OperationURLParameter = {
  parameterPath: "reference",
  mapper: {
    serializedName: "reference",
    required: true,
    type: {
      name: "String"
    }
  }
};

export const body2: OperationParameter = {
  parameterPath: ["options", "body"],
  mapper: SponsorkitDomainApiSponsorsBeneficiaryIdReferenceGetRequestMapper
};

export const body3: OperationParameter = {
  parameterPath: ["options", "body"],
  mapper: SponsorkitDomainApiSignupFromGitHubRequestMapper
};

export const body4: OperationParameter = {
  parameterPath: ["options", "body"],
  mapper: SponsorkitDomainApiSignupAsSponsorRequestMapper
};

export const body5: OperationParameter = {
  parameterPath: ["options", "body"],
  mapper: SponsorkitDomainApiSignupActivateStripeAccountUserIdRequestMapper
};

export const userId: OperationURLParameter = {
  parameterPath: "userId",
  mapper: {
    serializedName: "userId",
    required: true,
    type: {
      name: "String"
    }
  }
};

export const body6: OperationParameter = {
  parameterPath: ["options", "body"],
  mapper: SponsorkitDomainApiBrowserBeneficiaryIdReferenceRequestMapper
};

export const body7: OperationParameter = {
  parameterPath: ["options", "body"],
  mapper: SponsorkitDomainApiBountiesIntentRequestMapper
};

export const body8: OperationParameter = {
  parameterPath: ["options", "body"],
  mapper: SponsorkitDomainApiBountiesIntentPostRequestMapper
};

export const body9: OperationParameter = {
  parameterPath: ["options", "body"],
  mapper: SponsorkitDomainApiBountiesGitHubIssueIdGetRequestMapper
};

export const gitHubIssueId: OperationURLParameter = {
  parameterPath: "gitHubIssueId",
  mapper: {
    serializedName: "gitHubIssueId",
    required: true,
    type: {
      name: "String"
    }
  }
};
