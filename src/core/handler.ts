import type { Config } from "./types";
import { error, json, preflight } from "./lib/http";
import { handleVerifyInit, handleVerifyRedirect } from "./routes/verify";
import { handleCallbackPage, handleAuthCallback } from "./routes/callback";

/**
 * Platform-agnostic request handler. Adapters build a Config and hand
 * requests here.
 */
export async function handleRequest(req: Request, config: Config): Promise<Response> {
  if (req.method === "OPTIONS") return preflight();

  const { pathname } = new URL(req.url);
  const method = req.method;

  if (pathname === "/health" && method === "GET") {
    return json({ status: "ok" });
  }
  if (pathname === "/verify/init" && method === "POST") {
    return handleVerifyInit(req, config);
  }
  if (pathname === "/verify" && method === "GET") {
    return handleVerifyRedirect(req, config);
  }
  if (pathname === "/callback" && method === "GET") {
    return handleCallbackPage(req, config);
  }
  if (pathname === "/auth/callback" && method === "POST") {
    return handleAuthCallback(req, config);
  }

  return error("Not found", 404);
}
