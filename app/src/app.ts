import { HEADERS } from "@sponsorkit/shared";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { ConfigError } from "./env";
import { ApiError, problemResponse } from "./errors";
import type { AppEnv } from "./hono";
import { htmlErrorPage } from "./html";
import { describeError, logEvent } from "./log";
import { api } from "./routes/api";
import { oauth } from "./routes/oauth";

export function createApp(): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  // Request id + structured access log (path only: query strings carry codes and state).
  app.use("*", async (c, next) => {
    const requestId = crypto.randomUUID();
    c.set("requestId", requestId);
    const started = Date.now();
    await next();
    try {
      c.res.headers.set(HEADERS.requestId, requestId);
    } catch {
      // Immutable headers (e.g. a response passed through from the ASSETS binding).
      c.res = new Response(c.res.body, c.res);
      c.res.headers.set(HEADERS.requestId, requestId);
    }
    logEvent("info", {
      msg: "request",
      requestId,
      method: c.req.method,
      path: c.req.path,
      status: c.res.status,
      ms: Date.now() - started,
    });
  });

  app.use(
    "/api/v1/*",
    cors({
      origin: "*",
      allowMethods: ["GET", "POST", "OPTIONS"],
      allowHeaders: ["Authorization", "Content-Type"],
      exposeHeaders: [HEADERS.renewedSession, HEADERS.requestId, "Retry-After"],
      maxAge: 86400,
      credentials: false,
    }),
  );

  app.route("/api/v1", api);
  app.route("/api/oauth", oauth);

  app.all("/api/*", () => {
    throw new ApiError(404, "not_found", "No such endpoint");
  });

  // Static assets normally bypass the Worker; this covers `wrangler dev` and self-hosting.
  app.all("*", async (c) => {
    if (c.env.ASSETS) return c.env.ASSETS.fetch(c.req.raw);
    throw new ApiError(404, "not_found");
  });

  app.onError((err, c) => {
    const isOAuth = c.req.path.startsWith("/api/oauth/");
    if (err instanceof ApiError) {
      if (isOAuth) return htmlErrorPage(err.status, "Error", err.detail ?? err.code, c.get("requestId"));
      return problemResponse(err);
    }
    logEvent("error", {
      msg: err instanceof ConfigError ? "config_error" : "unhandled_error",
      requestId: c.get("requestId"),
      path: c.req.path,
      error: describeError(err),
    });
    if (isOAuth) return htmlErrorPage(500, "Something went wrong", "Please try again later.", c.get("requestId"));
    return problemResponse(new ApiError(500, "internal", "Internal error"));
  });

  app.notFound(() => problemResponse(new ApiError(404, "not_found")));

  return app;
}
