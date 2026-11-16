#!/usr/bin/env bun
/**
 * Conformance fake server (PROTOCOL §9).
 *
 *   bun sdks/conformance/server.ts [--port N] [--host 127.0.0.1]
 *
 * Prints exactly `LISTENING <port>` on stdout once it accepts connections, and
 * nothing else on stdout. Port 0 (the default) picks a free port. Stops on
 * SIGINT/SIGTERM, and also when stdin reaches EOF if
 * SPONSORKIT_CONFORMANCE_EXIT_ON_STDIN_EOF=1 (so a crashed runner never leaks it).
 */
import { startServer } from "./src/server";

function parseArgs(argv: string[]): { port: number; hostname: string } {
  let port = 0;
  let hostname = "127.0.0.1";
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    const [flag, inline] = arg.includes("=") ? (arg.split("=", 2) as [string, string]) : [arg, undefined];
    const value = () => inline ?? argv[++i];
    if (flag === "--port") {
      const v = Number(value());
      if (!Number.isInteger(v) || v < 0 || v > 65535) throw new Error(`Invalid --port`);
      port = v;
    } else if (flag === "--host") {
      hostname = value() ?? hostname;
    } else if (flag === "--help" || flag === "-h") {
      process.stderr.write("usage: bun sdks/conformance/server.ts [--port N] [--host 127.0.0.1]\n");
      process.exit(0);
    } else {
      throw new Error(`Unknown argument ${arg}`);
    }
  }
  return { port, hostname };
}

if (import.meta.main) {
  let args: { port: number; hostname: string };
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (e) {
    process.stderr.write(`${e instanceof Error ? e.message : String(e)}\n`);
    process.exit(2);
  }
  const server = await startServer(args);
  const shutdown = async () => {
    await server.stop();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
  if (process.env.SPONSORKIT_CONFORMANCE_EXIT_ON_STDIN_EOF === "1") {
    process.stdin.on("end", shutdown);
    process.stdin.resume();
  }
  process.stdout.write(`LISTENING ${server.port}\n`);
}
