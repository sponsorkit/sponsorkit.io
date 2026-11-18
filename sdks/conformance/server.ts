#!/usr/bin/env bun
/**
 * Conformance fake server (PROTOCOL §9).
 *
 *   bun sdks/conformance/server.ts [--port N] [--site-port N] [--print-site-port] [--host 127.0.0.1]
 *
 * Starts two listeners (API and site) and, once both accept connections, prints
 * exactly one line on stdout and nothing else:
 *   - `LISTENING <apiPort>` by default (unchanged, so existing harnesses keep working);
 *   - `LISTENING <apiPort> SITE <sitePort>` with --print-site-port.
 * The API base URL is `http://127.0.0.1:<apiPort>`; the site base URL is
 * `http://127.0.0.1:<sitePort>/sponsorkit.io`, also given by `GET /__control` ->
 * `siteBaseUrl`. Port 0 (the default) picks a free port. Stops on
 * SIGINT/SIGTERM, and also when stdin reaches EOF if
 * SPONSORKIT_CONFORMANCE_EXIT_ON_STDIN_EOF=1 (so a crashed runner never leaks it).
 */
import { startServer } from "./src/server";

type Args = { port: number; sitePort: number; hostname: string; printSitePort: boolean };

function parsePort(v: string | undefined, flag: string): number {
  const n = Number(v);
  if (v === undefined || !Number.isInteger(n) || n < 0 || n > 65535) throw new Error(`Invalid ${flag}`);
  return n;
}

function parseArgs(argv: string[]): Args {
  let port = 0;
  let sitePort = 0;
  let printSitePort = false;
  let hostname = "127.0.0.1";
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    const [flag, inline] = arg.includes("=") ? (arg.split("=", 2) as [string, string]) : [arg, undefined];
    const value = () => inline ?? argv[++i];
    if (flag === "--port") {
      port = parsePort(value(), "--port");
    } else if (flag === "--site-port") {
      sitePort = parsePort(value(), "--site-port");
    } else if (flag === "--print-site-port" && inline === undefined) {
      printSitePort = true;
    } else if (flag === "--host") {
      hostname = value() ?? hostname;
    } else if (flag === "--help" || flag === "-h") {
      process.stderr.write("usage: bun sdks/conformance/server.ts [--port N] [--site-port N] [--print-site-port] [--host 127.0.0.1]\n");
      process.exit(0);
    } else {
      throw new Error(`Unknown argument ${arg}`);
    }
  }
  return { port, sitePort, hostname, printSitePort };
}

if (import.meta.main) {
  let args: Args;
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
  process.stdout.write(args.printSitePort ? `LISTENING ${server.port} SITE ${server.sitePort}\n` : `LISTENING ${server.port}\n`);
}
