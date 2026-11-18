#!/usr/bin/env node
// Starts the local split deployment and keeps it running (for poking at it with a browser).
import { API_ORIGIN, APP_ORIGIN, FAKE_ORIGIN, SITE_BASE_URL } from "../lib/config.mjs";
import { startStack } from "../lib/stack.mjs";

const stack = await startStack();
console.log(`app   ${APP_ORIGIN}/\nsite  ${SITE_BASE_URL}/\napi   ${API_ORIGIN}/api/v1/health\nfake  ${FAKE_ORIGIN}\nCtrl-C to stop.`);
const stop = async () => {
  await stack.close();
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
