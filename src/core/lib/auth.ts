import type { Config } from "../types";

/**
 * Single shared-secret auth. Whoever deploys this sets AUTH_SECRET once and
 * passes it as a bearer token from their own integration(s).
 */
export function isAuthorized(config: Config, req: Request): boolean {
  const header = req.headers.get("Authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  return token.length > 0 && token === config.authSecret;
}

/** Public base URL of this deployment, used to build the OAuth redirect_uri. */
export function publicOrigin(config: Config, req: Request): string {
  return (config.publicUrl ?? new URL(req.url).origin).replace(/\/$/, "");
}
