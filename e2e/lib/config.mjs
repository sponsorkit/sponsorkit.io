/**
 * Where each part of the split deployment runs during the e2e test. Four distinct origins, and
 * three distinct *sites* for the parts that matter (API, site, app), so the test exercises the
 * real cross-site behaviour (Origin on the form POST, SameSite on the nonce cookie, postMessage
 * origins):
 *
 * | Part              | Default                                 | Production analogue                         |
 * |-------------------|-----------------------------------------|---------------------------------------------|
 * | API (wrangler)    | http://localhost:28787                  | https://api.sponsorkit.io                   |
 * | Site (static)     | http://127.0.0.2:28788/sponsorkit.io    | https://sponsorkit.github.io/sponsorkit.io  |
 * | App (SDK user)    | http://127.0.0.1:28789                  | https://app.example.com                     |
 * | Fake providers    | http://127.0.0.3:28790                  | github.com, api.github.com, opencollective.com |
 *
 * All are loopback, so Chromium treats them as secure contexts (the `__Host-` nonce cookie needs
 * one) and the API accepts `http://127.0.0.1` / `http://localhost` as an app `origin`.
 * Override with E2E_API_PORT, E2E_SITE_HOST, ... (see below).
 */
import path from "node:path";
import { fileURLToPath } from "node:url";

const env = process.env;
const num = (v, d) => (v ? Number(v) : d);

export const E2E_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const REPO_ROOT = path.resolve(E2E_DIR, "..");
export const CACHE_DIR = path.join(E2E_DIR, ".cache");
export const SITE_DIR = env.E2E_SITE_DIR ? path.resolve(env.E2E_SITE_DIR) : path.join(CACHE_DIR, "site");
export const SDK_DIST_DIR = env.E2E_SDK_DIST ? path.resolve(env.E2E_SDK_DIST) : path.join(REPO_ROOT, "sdks", "js", "dist");

export const API = { host: env.E2E_API_HOST ?? "localhost", bind: env.E2E_API_BIND ?? "127.0.0.1", port: num(env.E2E_API_PORT, 28787) };
export const SITE = { host: env.E2E_SITE_HOST ?? "127.0.0.2", port: num(env.E2E_SITE_PORT, 28788) };
export const APP = { host: env.E2E_APP_HOST ?? "127.0.0.1", port: num(env.E2E_APP_PORT, 28789) };
export const FAKE = { host: env.E2E_FAKE_HOST ?? "127.0.0.3", port: num(env.E2E_FAKE_PORT, 28790) };
export const INSPECTOR_PORT = num(env.E2E_INSPECTOR_PORT, 28791);

export const BASE_PATH = env.E2E_BASE_PATH ?? "/sponsorkit.io";

export const API_ORIGIN = `http://${API.host}:${API.port}`;
export const SITE_ORIGIN = `http://${SITE.host}:${SITE.port}`;
export const SITE_BASE_URL = `${SITE_ORIGIN}${BASE_PATH}`;
export const APP_ORIGIN = `http://${APP.host}:${APP.port}`;
export const FAKE_ORIGIN = `http://${FAKE.host}:${FAKE.port}`;

/** Provider base URLs handed to the Worker (GITHUB_OAUTH_BASE, ...). One fake server, four prefixes. */
export const PROVIDER_BASES = {
  GITHUB_OAUTH_BASE: `${FAKE_ORIGIN}/gh`,
  GITHUB_API_BASE: `${FAKE_ORIGIN}/gh-api`,
  OPENCOLLECTIVE_BASE: `${FAKE_ORIGIN}/oc`,
  OPENCOLLECTIVE_API_BASE: `${FAKE_ORIGIN}/oc-api`,
};

/** Fake OAuth app credentials (the Worker's secrets; the fake server checks them). */
export const CLIENTS = {
  github: { id: "e2e-gh-client", secret: "e2e-gh-secret" },
  opencollective: { id: "e2e-oc-client", secret: "e2e-oc-secret" },
};
export const GITHUB_METADATA_TOKEN = "ghp_e2e_metadata";

/** The sponsored accounts (the app's targets) and the supporter who signs in. */
export const MAINTAINER = { github: "octo-maint", opencollective: "octo-collective" };
export const TARGETS_PARAM = `github:${MAINTAINER.github},opencollective:${MAINTAINER.opencollective}`;
export const SUPPORTER = { github: { login: "kind-supporter", databaseId: 4242 }, opencollective: { id: "oc-acct-77", slug: "kind-supporter" } };

/** Chromium binary: the preinstalled one when present, else Playwright's own. */
export const CHROMIUM = env.PLAYWRIGHT_CHROMIUM_PATH ?? "/opt/pw-browsers/chromium";
