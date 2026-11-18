/**
 * Spawns the conformance fake server (`bun sdks/conformance/server.ts --print-site-port`) and reads its
 * `LISTENING <apiPort> SITE <sitePort>` line: an API listener and a separate site listener (PROTOCOL §0).
 */
import { fileURLToPath } from "node:url";
import { SITE_BASE_PATH } from "@sponsorkit/conformance";

export interface FakeServer {
  /** API base URL (`$BASE_URL`). */
  baseUrl: string;
  /** Site base URL with its base path (`$SITE_BASE_URL`). */
  siteBaseUrl: string;
  port: number;
  sitePort: number;
  stop(): Promise<void>;
}

const SERVER = fileURLToPath(new URL("../../../conformance/server.ts", import.meta.url));

export async function spawnFakeServer(): Promise<FakeServer> {
  const proc = Bun.spawn(["bun", SERVER, "--port", "0", "--print-site-port"], {
    stdin: "pipe",
    stdout: "pipe",
    stderr: "inherit",
    env: { ...process.env, SPONSORKIT_CONFORMANCE_EXIT_ON_STDIN_EOF: "1" },
  });
  const reader = proc.stdout.getReader();
  const decoder = new TextDecoder();
  let buffered = "";
  const deadline = Date.now() + 15_000;
  while (!buffered.includes("\n")) {
    if (Date.now() > deadline) throw new Error("Fake server did not start");
    const { value, done } = await reader.read();
    if (done) throw new Error(`Fake server exited before listening: ${buffered}`);
    buffered += decoder.decode(value, { stream: true });
  }
  reader.releaseLock();
  const m = /^LISTENING (\d+) SITE (\d+)\n/.exec(buffered);
  if (!m) throw new Error(`Unexpected fake server output: ${JSON.stringify(buffered)}`);
  const port = Number(m[1]);
  const sitePort = Number(m[2]);
  return {
    port,
    sitePort,
    baseUrl: `http://127.0.0.1:${port}`,
    siteBaseUrl: `http://127.0.0.1:${sitePort}${SITE_BASE_PATH}`,
    async stop() {
      proc.kill("SIGTERM");
      await proc.exited;
    },
  };
}
