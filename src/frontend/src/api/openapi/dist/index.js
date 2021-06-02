'use strict';

Object.defineProperty(exports, '__esModule', { value: true });

var tslib = require('tslib');
var coreClient = require('@azure/core-client');

var SponsorkitDomainApiSponsorsBeneficiaryRequest = {
    type: {
        name: "Composite",
        className: "SponsorkitDomainApiSponsorsBeneficiaryRequest",
        modelProperties: {
            beneficiaryId: {
                serializedName: "beneficiaryId",
                type: {
                    name: "Uuid"
                }
            }
        }
    }
};
var SponsorkitDomainApiSponsorsBeneficiaryResponse = {
    type: {
        name: "Composite",
        className: "SponsorkitDomainApiSponsorsBeneficiaryResponse",
        modelProperties: {
            id: {
                serializedName: "id",
                type: {
                    name: "Uuid"
                }
            },
            gitHubId: {
                serializedName: "gitHubId",
                nullable: true,
                type: {
                    name: "Number"
                }
            }
        }
    }
};
var SponsorkitDomainApiSponsorsBeneficiaryIdReferencePostRequest = {
    type: {
        name: "Composite",
        className: "SponsorkitDomainApiSponsorsBeneficiaryIdReferencePostRequest",
        modelProperties: {
            beneficiaryId: {
                serializedName: "beneficiaryId",
                type: {
                    name: "Uuid"
                }
            },
            reference: {
                serializedName: "reference",
                type: {
                    name: "String"
                }
            },
            amountInHundreds: {
                serializedName: "amountInHundreds",
                nullable: true,
                type: {
                    name: "Number"
                }
            },
            email: {
                serializedName: "email",
                nullable: true,
                type: {
                    name: "String"
                }
            },
            stripeCardId: {
                serializedName: "stripeCardId",
                nullable: true,
                type: {
                    name: "String"
                }
            }
        }
    }
};
var SponsorkitDomainApiSponsorsBeneficiaryIdReferenceGetRequest = {
    type: {
        name: "Composite",
        className: "SponsorkitDomainApiSponsorsBeneficiaryIdReferenceGetRequest",
        modelProperties: {
            beneficiaryId: {
                serializedName: "beneficiaryId",
                type: {
                    name: "Uuid"
                }
            },
            reference: {
                serializedName: "reference",
                type: {
                    name: "String"
                }
            }
        }
    }
};
var SponsorkitDomainApiSponsorsBeneficiaryIdReferenceGetResponse = {
    type: {
        name: "Composite",
        className: "SponsorkitDomainApiSponsorsBeneficiaryIdReferenceGetResponse",
        modelProperties: {
            donations: {
                serializedName: "donations",
                type: {
                    name: "Composite",
                    className: "SponsorkitDomainApiSponsorsBeneficiaryIdReferenceGetModelsDonationsResponse"
                }
            },
            sponsors: {
                serializedName: "sponsors",
                type: {
                    name: "Composite",
                    className: "SponsorkitDomainApiSponsorsBeneficiaryIdReferenceGetModelsSponsorSponsorsResponse"
                }
            }
        }
    }
};
var SponsorkitDomainApiSponsorsBeneficiaryIdReferenceGetModelsDonationsResponse = {
    type: {
        name: "Composite",
        className: "SponsorkitDomainApiSponsorsBeneficiaryIdReferenceGetModelsDonationsResponse",
        modelProperties: {
            totalInHundreds: {
                serializedName: "totalInHundreds",
                readOnly: true,
                type: {
                    name: "Number"
                }
            },
            monthlyInHundreds: {
                serializedName: "monthlyInHundreds",
                readOnly: true,
                type: {
                    name: "Number"
                }
            }
        }
    }
};
var SponsorkitDomainApiSponsorsBeneficiaryIdReferenceGetModelsSponsorSponsorsResponse = {
    type: {
        name: "Composite",
        className: "SponsorkitDomainApiSponsorsBeneficiaryIdReferenceGetModelsSponsorSponsorsResponse",
        modelProperties: {
            current: {
                serializedName: "current",
                type: {
                    name: "Composite",
                    className: "SponsorkitDomainApiSponsorsBeneficiaryIdReferenceGetModelsSponsorResponse"
                }
            },
            byAmount: {
                serializedName: "byAmount",
                type: {
                    name: "Composite",
                    className: "SponsorkitDomainApiSponsorsBeneficiaryIdReferenceGetModelsSponsorSponsorsByAmountResponse"
                }
            },
            byDate: {
                serializedName: "byDate",
                type: {
                    name: "Composite",
                    className: "SponsorkitDomainApiSponsorsBeneficiaryIdReferenceGetModelsSponsorSponsorsByDateResponse"
                }
            }
        }
    }
};
var SponsorkitDomainApiSponsorsBeneficiaryIdReferenceGetModelsSponsorResponse = {
    type: {
        name: "Composite",
        className: "SponsorkitDomainApiSponsorsBeneficiaryIdReferenceGetModelsSponsorResponse",
        modelProperties: {
            monthlyAmountInHundreds: {
                serializedName: "monthlyAmountInHundreds",
                readOnly: true,
                nullable: true,
                type: {
                    name: "Number"
                }
            },
            totalAmountInHundreds: {
                serializedName: "totalAmountInHundreds",
                readOnly: true,
                type: {
                    name: "Number"
                }
            },
            startedAtUtc: {
                serializedName: "startedAtUtc",
                readOnly: true,
                type: {
                    name: "DateTime"
                }
            }
        }
    }
};
var SponsorkitDomainApiSponsorsBeneficiaryIdReferenceGetModelsSponsorSponsorsByAmountResponse = {
    type: {
        name: "Composite",
        className: "SponsorkitDomainApiSponsorsBeneficiaryIdReferenceGetModelsSponsorSponsorsByAmountResponse",
        modelProperties: {
            most: {
                serializedName: "most",
                readOnly: true,
                type: {
                    name: "Sequence",
                    element: {
                        type: {
                            name: "Composite",
                            className: "SponsorkitDomainApiSponsorsBeneficiaryIdReferenceGetModelsSponsorResponse"
                        }
                    }
                }
            },
            least: {
                serializedName: "least",
                readOnly: true,
                type: {
                    name: "Sequence",
                    element: {
                        type: {
                            name: "Composite",
                            className: "SponsorkitDomainApiSponsorsBeneficiaryIdReferenceGetModelsSponsorResponse"
                        }
                    }
                }
            }
        }
    }
};
var SponsorkitDomainApiSponsorsBeneficiaryIdReferenceGetModelsSponsorSponsorsByDateResponse = {
    type: {
        name: "Composite",
        className: "SponsorkitDomainApiSponsorsBeneficiaryIdReferenceGetModelsSponsorSponsorsByDateResponse",
        modelProperties: {
            latest: {
                serializedName: "latest",
                readOnly: true,
                type: {
                    name: "Sequence",
                    element: {
                        type: {
                            name: "Composite",
                            className: "SponsorkitDomainApiSponsorsBeneficiaryIdReferenceGetModelsSponsorResponse"
                        }
                    }
                }
            },
            oldest: {
                serializedName: "oldest",
                readOnly: true,
                type: {
                    name: "Sequence",
                    element: {
                        type: {
                            name: "Composite",
                            className: "SponsorkitDomainApiSponsorsBeneficiaryIdReferenceGetModelsSponsorResponse"
                        }
                    }
                }
            }
        }
    }
};
var SponsorkitDomainApiSignupFromGitHubRequest = {
    type: {
        name: "Composite",
        className: "SponsorkitDomainApiSignupFromGitHubRequest",
        modelProperties: {
            gitHubAuthenticationCode: {
                serializedName: "gitHubAuthenticationCode",
                type: {
                    name: "String"
                }
            }
        }
    }
};
var SponsorkitDomainApiSignupFromGitHubResponse = {
    type: {
        name: "Composite",
        className: "SponsorkitDomainApiSignupFromGitHubResponse",
        modelProperties: {
            token: {
                serializedName: "token",
                type: {
                    name: "String"
                }
            }
        }
    }
};
var SponsorkitDomainApiSignupActivateStripeAccountUserIdRequest = {
    type: {
        name: "Composite",
        className: "SponsorkitDomainApiSignupActivateStripeAccountUserIdRequest",
        modelProperties: {
            userId: {
                serializedName: "userId",
                type: {
                    name: "Uuid"
                }
            }
        }
    }
};
var SponsorkitDomainApiBrowserBeneficiaryIdReferenceRequest = {
    type: {
        name: "Composite",
        className: "SponsorkitDomainApiBrowserBeneficiaryIdReferenceRequest",
        modelProperties: {
            beneficiaryId: {
                serializedName: "beneficiaryId",
                type: {
                    name: "Uuid"
                }
            },
            reference: {
                serializedName: "reference",
                type: {
                    name: "String"
                }
            }
        }
    }
};

var Mappers = /*#__PURE__*/Object.freeze({
    __proto__: null,
    SponsorkitDomainApiSponsorsBeneficiaryRequest: SponsorkitDomainApiSponsorsBeneficiaryRequest,
    SponsorkitDomainApiSponsorsBeneficiaryResponse: SponsorkitDomainApiSponsorsBeneficiaryResponse,
    SponsorkitDomainApiSponsorsBeneficiaryIdReferencePostRequest: SponsorkitDomainApiSponsorsBeneficiaryIdReferencePostRequest,
    SponsorkitDomainApiSponsorsBeneficiaryIdReferenceGetRequest: SponsorkitDomainApiSponsorsBeneficiaryIdReferenceGetRequest,
    SponsorkitDomainApiSponsorsBeneficiaryIdReferenceGetResponse: SponsorkitDomainApiSponsorsBeneficiaryIdReferenceGetResponse,
    SponsorkitDomainApiSponsorsBeneficiaryIdReferenceGetModelsDonationsResponse: SponsorkitDomainApiSponsorsBeneficiaryIdReferenceGetModelsDonationsResponse,
    SponsorkitDomainApiSponsorsBeneficiaryIdReferenceGetModelsSponsorSponsorsResponse: SponsorkitDomainApiSponsorsBeneficiaryIdReferenceGetModelsSponsorSponsorsResponse,
    SponsorkitDomainApiSponsorsBeneficiaryIdReferenceGetModelsSponsorResponse: SponsorkitDomainApiSponsorsBeneficiaryIdReferenceGetModelsSponsorResponse,
    SponsorkitDomainApiSponsorsBeneficiaryIdReferenceGetModelsSponsorSponsorsByAmountResponse: SponsorkitDomainApiSponsorsBeneficiaryIdReferenceGetModelsSponsorSponsorsByAmountResponse,
    SponsorkitDomainApiSponsorsBeneficiaryIdReferenceGetModelsSponsorSponsorsByDateResponse: SponsorkitDomainApiSponsorsBeneficiaryIdReferenceGetModelsSponsorSponsorsByDateResponse,
    SponsorkitDomainApiSignupFromGitHubRequest: SponsorkitDomainApiSignupFromGitHubRequest,
    SponsorkitDomainApiSignupFromGitHubResponse: SponsorkitDomainApiSignupFromGitHubResponse,
    SponsorkitDomainApiSignupActivateStripeAccountUserIdRequest: SponsorkitDomainApiSignupActivateStripeAccountUserIdRequest,
    SponsorkitDomainApiBrowserBeneficiaryIdReferenceRequest: SponsorkitDomainApiBrowserBeneficiaryIdReferenceRequest
});

var $host = {
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
var contentType = {
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
var accept = {
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
var beneficiaryId = {
    parameterPath: "beneficiaryId",
    mapper: {
        serializedName: "beneficiaryId",
        required: true,
        type: {
            name: "String"
        }
    }
};
var body1 = {
    parameterPath: ["options", "body"],
    mapper: SponsorkitDomainApiSponsorsBeneficiaryIdReferencePostRequest
};
var reference = {
    parameterPath: "reference",
    mapper: {
        serializedName: "reference",
        required: true,
        type: {
            name: "String"
        }
    }
};
var body3 = {
    parameterPath: ["options", "body"],
    mapper: SponsorkitDomainApiSignupFromGitHubRequest
};
var userId = {
    parameterPath: "userId",
    mapper: {
        serializedName: "userId",
        required: true,
        type: {
            name: "String"
        }
    }
};

var GeneralContext = /** @class */ (function (_super) {
    tslib.__extends(GeneralContext, _super);
    /**
     * Initializes a new instance of the GeneralContext class.
     * @param credentials Subscription credentials which uniquely identify client subscription.
     * @param $host server parameter
     * @param options The parameter options
     */
    function GeneralContext(credentials, $host, options) {
        var _this = this;
        if (credentials === undefined) {
            throw new Error("'credentials' cannot be null");
        }
        if ($host === undefined) {
            throw new Error("'$host' cannot be null");
        }
        // Initializing default values for options
        if (!options) {
            options = {};
        }
        var defaults = {
            requestContentType: "application/json; charset=utf-8",
            credential: credentials
        };
        var optionsWithDefaults = tslib.__assign(tslib.__assign(tslib.__assign({}, defaults), options), { baseUri: options.endpoint || "{$host}" });
        _this = _super.call(this, optionsWithDefaults) || this;
        // Parameter assignments
        _this.$host = $host;
        return _this;
    }
    return GeneralContext;
}(coreClient.ServiceClient));

var General = /** @class */ (function (_super) {
    tslib.__extends(General, _super);
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
// Operation Specifications
var serializer = coreClient.createSerializer(Mappers, /* isXml */ false);
var healthGetOperationSpec = {
    path: "/health",
    httpMethod: "GET",
    responses: { 200: {} },
    urlParameters: [$host],
    serializer: serializer
};
var apiSponsorsBeneficiaryIdGetOperationSpec = {
    path: "/api/sponsors/{beneficiaryId}",
    httpMethod: "GET",
    responses: {
        200: {
            bodyMapper: SponsorkitDomainApiSponsorsBeneficiaryResponse
        }
    },
    urlParameters: [$host, beneficiaryId],
    headerParameters: [contentType, accept],
    mediaType: "json",
    serializer: serializer
};
var apiSponsorsBeneficiaryIdReferencePostOperationSpec = {
    path: "/api/sponsors/{beneficiaryId}/{reference}",
    httpMethod: "POST",
    responses: { 200: {} },
    requestBody: body1,
    urlParameters: [
        $host,
        beneficiaryId,
        reference
    ],
    headerParameters: [contentType],
    mediaType: "json",
    serializer: serializer
};
var apiSponsorsBeneficiaryIdReferenceGetOperationSpec = {
    path: "/api/sponsors/{beneficiaryId}/{reference}",
    httpMethod: "GET",
    responses: {
        200: {
            bodyMapper: SponsorkitDomainApiSponsorsBeneficiaryIdReferenceGetResponse
        }
    },
    urlParameters: [
        $host,
        beneficiaryId,
        reference
    ],
    headerParameters: [contentType, accept],
    mediaType: "json",
    serializer: serializer
};
var apiSignupFromGithubPostOperationSpec = {
    path: "/api/signup/from-github",
    httpMethod: "POST",
    responses: {
        200: {
            bodyMapper: SponsorkitDomainApiSignupFromGitHubResponse
        }
    },
    requestBody: body3,
    urlParameters: [$host],
    headerParameters: [contentType, accept],
    mediaType: "json",
    serializer: serializer
};
var apiSignupAsBeneficiaryPostOperationSpec = {
    path: "/api/signup/as-beneficiary",
    httpMethod: "POST",
    responses: { 200: {} },
    urlParameters: [$host],
    serializer: serializer
};
var apiSignupActivateStripeAccountUserIdGetOperationSpec = {
    path: "/api/signup/activate-stripe-account/{userId}",
    httpMethod: "GET",
    responses: { 200: {} },
    urlParameters: [$host, userId],
    headerParameters: [contentType],
    mediaType: "json",
    serializer: serializer
};
var apiBrowserBeneficiaryIdReferenceGetOperationSpec = {
    path: "/api/browser/{beneficiaryId}/{reference}",
    httpMethod: "GET",
    responses: { 200: {} },
    urlParameters: [
        $host,
        beneficiaryId,
        reference
    ],
    headerParameters: [contentType],
    mediaType: "json",
    serializer: serializer
};

exports.General = General;
exports.GeneralContext = GeneralContext;
//# sourceMappingURL=index.js.map
