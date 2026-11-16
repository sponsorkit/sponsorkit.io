import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const here = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: { alias: { "@": path.join(here, "src") } },
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
