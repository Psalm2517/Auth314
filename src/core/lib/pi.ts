import type { Config, PiMeResponse } from "../types";

const PI_ME_URL = "https://api.minepi.com/v2/me";
const PI_AUTHORIZE_URL = "https://accounts.pinet.com/oauth/authorize";

export class PiApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "PiApiError";
  }
}

/**
 * Build the Pi Sign-in authorize URL.
 *
 * Pi only supports the implicit flow (response_type=token), so the access
 * token comes back in the URL fragment -- see lib/pages.ts for the callback
 * page that reads it. There is no code exchange and no client secret.
 *
 * `redirectUri` must exactly match one of the redirect URIs registered for
 * your app in the Pi Developer Portal.
 */
export function buildAuthorizeUrl(
  config: Config,
  redirectUri: string,
  state: string,
): string {
  const url = new URL(PI_AUTHORIZE_URL);
  url.searchParams.set("response_type", "token");
  url.searchParams.set("client_id", config.piClientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("scope", "username");
  url.searchParams.set("state", state);
  return url.toString();
}

/**
 * Verify a user's access token against the Pi Platform API and return their
 * identity. Throws PiApiError on any non-2xx response.
 */
export async function fetchPiMe(accessToken: string): Promise<PiMeResponse> {
  const res = await fetch(PI_ME_URL, {
    method: "GET",
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new PiApiError(`Pi /me returned ${res.status}: ${body.slice(0, 200)}`, res.status);
  }

  const data = (await res.json()) as PiMeResponse;
  if (!data || !data.uid || !data.username) {
    throw new PiApiError("Pi /me response missing uid or username", 502);
  }
  return data;
}
