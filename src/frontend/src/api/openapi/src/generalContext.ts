import * as coreHttp from "@azure/core-http";
import { GeneralOptionalParams } from "./models";

const packageName = "@sponsorkit/client";
const packageVersion = "1.0.0-beta.1";

export class GeneralContext extends coreHttp.ServiceClient {
  $host: string;

  /**
   * Initializes a new instance of the GeneralContext class.
   * @param credentials Subscription credentials which uniquely identify client subscription.
   * @param $host server parameter
   * @param options The parameter options
   */
  constructor(
    credentials: coreHttp.TokenCredential | coreHttp.ServiceClientCredentials,
    $host: string,
    options?: GeneralOptionalParams
  ) {
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

    if (!options.userAgent) {
      const defaultUserAgent = coreHttp.getDefaultUserAgentValue();
      options.userAgent = `${packageName}/${packageVersion} ${defaultUserAgent}`;
    }

    super(credentials, options);

    this.requestContentType = "application/json; charset=utf-8";
    this.baseUri = options.endpoint || "{$host}";
    // Parameter assignments
    this.$host = $host;
  }
}
