import type { Config } from "../types";
import { error, json, html } from "../lib/http";
import { publicOrigin } from "../lib/auth";
import { callbackPage } from "../lib/pages";
import { fetchPiMe, PiApiError } from "../lib/pi";
import { getSession, markSessionUsed, isSessionExpired } from "../lib/session";
import { logVerification } from "../lib/verlog";

/**
 * GET /callback
 * The OAuth redirect_uri. Serves the page that reads the access token out of
 * the URL fragment and posts it back to /auth/callback.
 */
export function handleCallbackPage(req: Request, config: Config): Response {
  return html(callbackPage(publicOrigin(config, req)));
}

interface AuthCallbackBody {
  access_token?: string;
  session?: string;
}

/**
 * POST /auth/callback
 * Called by the callback page. Verifies the token with Pi and delivers the
 * webhook.
 */
export async function handleAuthCallback(req: Request, config: Config): Promise<Response> {
  let body: AuthCallbackBody;
  try {
    body = (await req.json()) as AuthCallbackBody;
  } catch {
    return error("Invalid JSON body", 400);
  }

  const { access_token, session } = body;
  if (!access_token) return error("access_token is required", 400);
  if (!session) return error("session is required", 400);

  // Look up the session, reject if missing, used, or expired.
  const record = await getSession(config, session);
  if (!record) return error("Session not found or expired", 404);
  if (record.used) return error("Session already used", 409);
  if (isSessionExpired(record)) return error("Session expired", 410);

  // Consume it immediately -- one-time use guard.
  await markSessionUsed(config, session, record);

  // Verify the access token against the Pi API.
  let me;
  try {
    me = await fetchPiMe(access_token);
  } catch (err) {
    const status = err instanceof PiApiError ? 401 : 502;
    return error(`Pi verification failed: ${(err as Error).message}`, status);
  }

  // Log before delivery -- the Pi sign-in is already complete at this point,
  // so an unreachable webhook must not erase that fact.
  logVerification(config, {
    timestamp: new Date().toISOString(),
    ref: record.ref,
  }).catch(() => {});

  // Deliver the webhook. Pi identity (uid, username) is deliberately not
  // included, per Pi's Developer Terms of Use -- only a verified signal and
  // the caller's own opaque ref.
  try {
    const res = await fetch(record.callback_url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ref: record.ref, verified: true }),
    });
    if (!res.ok) {
      return error(`Callback delivery failed with status ${res.status}`, 502);
    }
  } catch (err) {
    return error(`Callback delivery failed: ${(err as Error).message}`, 502);
  }

  return json({ status: "verified", username: me.username });
}
