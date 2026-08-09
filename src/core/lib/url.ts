const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

/**
 * Callback and redirect targets must be https, except on loopback, where
 * http is allowed so you can develop against localhost. This mirrors the rule
 * Pi applies to redirect URIs in the Developer Portal.
 */
export function isAcceptableUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol === "https:") return true;
  return url.protocol === "http:" && LOOPBACK.has(url.hostname);
}
