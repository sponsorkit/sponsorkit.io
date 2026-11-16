import { defineConfig } from "vitest/config";

// Tests call the Hono app's fetch() directly in Node (Web Crypto, fetch, Request/Response
// are all standard globals); provider HTTP is faked by stubbing global fetch.
export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
    restoreMocks: true,
    unstubGlobals: true,
  },
});
