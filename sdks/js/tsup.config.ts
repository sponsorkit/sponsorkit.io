import { defineConfig } from "tsup";

export default defineConfig({
  entry: { index: "src/index.ts", node: "src/node/index.ts", server: "src/server.ts", elements: "src/elements.ts" },
  format: ["esm", "cjs"],
  dts: true,
  sourcemap: true,
  clean: true,
  target: "es2022",
  platform: "neutral",
  splitting: true,
  treeshake: true,
  external: [/^node:/],
  removeNodeProtocol: false,
});
