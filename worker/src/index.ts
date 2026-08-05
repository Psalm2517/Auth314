import type { Env } from "./types";
import { error, preflight } from "./lib/http";
import { handleVerifyInit, handleVerifyStatus } from "./routes/verify";
import { handleAuthCallback } from "./routes/callback";
import { handleHealth } from "./routes/health";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // CORS preflight — integrations call this API from external origins.
    if (request.method === "OPTIONS") {
      return preflight();
    }

    const url = new URL(request.url);
    const { pathname } = url;
    const method = request.method;

    if (pathname === "/health" && method === "GET") {
      return handleHealth();
    }

    if (pathname === "/verify/init" && method === "POST") {
      return handleVerifyInit(request, env);
    }

    if (pathname === "/verify/status" && method === "GET") {
      return handleVerifyStatus(request, env);
    }

    if (pathname === "/auth/callback" && method === "POST") {
      return handleAuthCallback(request, env);
    }

    return error("Not found", 404);
  },
};
