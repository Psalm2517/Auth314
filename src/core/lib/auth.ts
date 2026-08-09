import type { Config } from "../types";

/**
 * Compare two strings in time independent of how many leading characters
 * match, so a caller can't recover the secret byte-by-byte by timing us.
 */
function timingSafeEqual(a: string, b: string): boolean {
  const ab = new TextEncoder().encode(a);
  const bb = new TextEncoder().encode(b);
  // Length is not secret, but bail early rather than index out of bounds.
  if (ab.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < ab.length; i++) diff |= ab[i] ^ bb[i];
  return diff === 0;
}

/**
 * Single shared-secret auth. You set AUTH_SECRET once and your own app sends
 * it as a bearer token.
 */
export function isAuthorized(config: Config, req: Request): boolean {
  const header = req.headers.get("Authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token || !config.authSecret) return false;
  return timingSafeEqual(token, config.authSecret);
}

/** Public base URL of this deployment, used to build the OAuth redirect_uri. */
export function publicOrigin(config: Config, req: Request): string {
  return (config.publicUrl ?? new URL(req.url).origin).replace(/\/$/, "");
}
