import * as coreClient from "@azure/core-client";
import * as coreAuth from "@azure/core-auth";
import { GeneralOptionalParams } from "./models";
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
//# sourceMappingURL=generalContext.d.ts.map