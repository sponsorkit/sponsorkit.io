import { __assign, __extends } from "tslib";
import * as coreClient from "@azure/core-client";
var GeneralContext = /** @class */ (function (_super) {
    __extends(GeneralContext, _super);
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
        var optionsWithDefaults = __assign(__assign(__assign({}, defaults), options), { baseUri: options.endpoint || "{$host}" });
        _this = _super.call(this, optionsWithDefaults) || this;
        // Parameter assignments
        _this.$host = $host;
        return _this;
    }
    return GeneralContext;
}(coreClient.ServiceClient));
export { GeneralContext };
//# sourceMappingURL=generalContext.js.map