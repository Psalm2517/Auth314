import type { Config } from "./types";
import { error, json, preflight } from "./lib/http";
import { handleVerifyInit, handleVerifyRedirect, handleExchange } from "./routes/verify";
import { handleCallbackPage, handleAuthCallback } from "./routes/callback";

/**
 * The whole API surface. Runtime entry points build a Config and hand
 * requests here; nothing below this line knows about Cloudflare.
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
  if (pathname === "/verify/exchange" && method === "POST") {
    return handleExchange(req, config);
  }
  if (pathname === "/callback" && method === "GET") {
    return handleCallbackPage(req, config);
  }
  if (pathname === "/auth/callback" && method === "POST") {
    return handleAuthCallback(req, config);
  }

  return error("Not found", 404);
}
