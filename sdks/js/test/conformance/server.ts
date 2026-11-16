/** Spawns the conformance fake server (`bun sdks/conformance/server.ts`) and reads its `LISTENING <port>` line. */
import { fileURLToPath } from "node:url";

export interface FakeServer {
  baseUrl: string;
  port: number;
  stop(): Promise<void>;
}

const SERVER = fileURLToPath(new URL("../../../conformance/server.ts", import.meta.url));

export async function spawnFakeServer(): Promise<FakeServer> {
  const proc = Bun.spawn(["bun", SERVER, "--port", "0"], {
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
  const m = /^LISTENING (\d+)\n/.exec(buffered);
  if (!m) throw new Error(`Unexpected fake server output: ${JSON.stringify(buffered)}`);
  const port = Number(m[1]);
  return {
    port,
    baseUrl: `http://127.0.0.1:${port}`,
    async stop() {
      proc.kill("SIGTERM");
      await proc.exited;
    },
  };
}
