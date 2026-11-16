/** RFC 8252 loopback receiver for native sign-in (PROTOCOL §7). */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

/** What arrived at `/callback`. */
export type CallbackResult = { code: string } | { error: string };

/** A listening loopback receiver. */
export interface LoopbackReceiver {
  /** `http://127.0.0.1:<port>/callback`. */
  redirectUri: string;
  /** Resolves with the first `/callback` request's code or error. */
  result: Promise<CallbackResult>;
  /** Stops listening. */
  close(): Promise<void>;
}

const PAGE = (title: string, body: string) =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>` +
  `<style>body{font:16px/1.5 system-ui,sans-serif;max-width:32rem;margin:4rem auto;padding:0 1rem;color:#222}</style></head>` +
  `<body><h1>${title}</h1><p>${body}</p></body></html>`;

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/**
 * Binds `127.0.0.1:0` and waits for `GET /callback?code=…` or `?error=…`.
 * The browser gets a small "You can close this window" page, or a `302` to
 * `redirectOnCode` (used to continue to checkout).
 */
export async function startLoopbackReceiver(redirectOnCode?: string): Promise<LoopbackReceiver> {
  let settle!: (r: CallbackResult) => void;
  let settled = false;
  const result = new Promise<CallbackResult>((resolve) => {
    settle = (r) => {
      if (settled) return;
      settled = true;
      resolve(r);
    };
  });

  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    res.setHeader("connection", "close");
    res.setHeader("cache-control", "no-store");
    if (req.method !== "GET" || url.pathname !== "/callback" || settled) {
      res.writeHead(404, { "content-type": "text/plain; charset=utf-8" }).end("Not found");
      return;
    }
    const code = url.searchParams.get("code");
    const error = url.searchParams.get("error");
    if (code) {
      settle({ code });
      if (redirectOnCode) res.writeHead(302, { location: redirectOnCode }).end();
      else res.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(PAGE("Signed in", "You can close this window and return to the app."));
    } else if (!error) {
      // Not a delivery (PROTOCOL §7: wait for `?code=` or `?error=`): keep waiting.
      res.writeHead(400, { "content-type": "text/plain; charset=utf-8" }).end("Missing code");
    } else {
      const e = error;
      settle({ error: e });
      res
        .writeHead(200, { "content-type": "text/html; charset=utf-8" })
        .end(PAGE("Sign-in failed", `Sign-in did not complete (${escapeHtml(e)}). You can close this window.`));
    }
  });
  server.keepAliveTimeout = 1;

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
  const { port } = server.address() as AddressInfo;
  let closed: Promise<void> | null = null;
  return {
    redirectUri: `http://127.0.0.1:${port}/callback`,
    result,
    close() {
      closed ??= new Promise<void>((resolve) => {
        server.close(() => resolve());
        (server as { closeIdleConnections?: () => void }).closeIdleConnections?.();
        // Give in-flight responses (e.g. the 302) a moment, then drop everything.
        setTimeout(() => (server as { closeAllConnections?: () => void }).closeAllConnections?.(), 1000).unref?.();
      });
      return closed;
    },
  };
}
