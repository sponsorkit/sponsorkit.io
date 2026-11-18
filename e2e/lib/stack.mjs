/** Starts the whole split deployment locally: fake providers, the API (wrangler dev), the site and the app. */
import { existsSync } from "node:fs";
import path from "node:path";
import { startApi } from "./api.mjs";
import { API_ORIGIN, APP, BASE_PATH, MAINTAINER, SDK_DIST_DIR, SITE, SITE_BASE_URL, SITE_DIR } from "./config.mjs";
import { startFakeProviders } from "./fake-providers.mjs";
import { startAppServer, startSiteServer } from "./static.mjs";

/** Options the app page passes to `new Sponsorkit()` (PROTOCOL §7: apiBaseUrl + siteBaseUrl). */
export const SDK_OPTIONS = {
  github: MAINTAINER.github,
  opencollective: MAINTAINER.opencollective,
  apiBaseUrl: API_ORIGIN,
  siteBaseUrl: SITE_BASE_URL,
  checkoutPollInterval: 0.5,
  signInTimeout: 120,
};

export async function startStack() {
  if (!existsSync(path.join(SITE_DIR, "connect", "index.html"))) throw new Error(`No site build at ${SITE_DIR}; run \`node scripts/build.mjs\` first`);
  if (!existsSync(path.join(SDK_DIST_DIR, "index.js"))) throw new Error(`No SDK build at ${SDK_DIST_DIR}; run \`node scripts/build.mjs\` first`);
  const started = [];
  const close = async () => {
    for (const s of started.reverse()) await s.close().catch(() => {});
  };
  try {
    const fake = await startFakeProviders();
    started.push(fake);
    const site = await startSiteServer({ root: SITE_DIR, basePath: BASE_PATH, host: SITE.host, port: SITE.port });
    started.push(site);
    const app = await startAppServer({ sdkDir: SDK_DIST_DIR, host: APP.host, port: APP.port, options: SDK_OPTIONS });
    started.push(app);
    const api = await startApi();
    started.push(api);
    return { fake, site, app, api, close };
  } catch (e) {
    await close();
    throw e;
  }
}
