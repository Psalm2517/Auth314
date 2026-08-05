import type { Env } from "../types";

/**
 * Self-hosted single-secret auth: whoever deploys this worker sets
 * AUTH_SECRET once (wrangler secret put AUTH_SECRET) and passes it as a
 * bearer token from their own integration(s). There is no multi-tenant key
 * system -- this is a single-operator core service.
 */
export function isAuthorized(env: Env, req: Request): boolean {
  const header = req.headers.get("Authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  return token.length > 0 && token === env.AUTH_SECRET;
}
