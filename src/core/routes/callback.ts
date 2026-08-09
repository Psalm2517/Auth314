import type { Config } from "../types";
import { error, json, html } from "../lib/http";
import { publicOrigin } from "../lib/auth";
import { callbackPage } from "../lib/pages";
import { fetchPiMe, PiApiError } from "../lib/pi";
import { issueCode } from "../lib/code";
import { getSession, markSessionUsed, isSessionExpired } from "../lib/session";

/**
 * GET /callback
 * The OAuth redirect_uri registered with Pi. Serves the page that reads the
 * access token out of the URL fragment and posts it back to /auth/callback.
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
 * Called by the callback page. Verifies the token with Pi, then fires the
 * webhook and/or mints a redirect code, depending on how the session was
 * created.
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

  // Auth314 runs inside your own deployment, so handing back the uid is an
  // internal hop: you own the Pi app that minted it, and you run both this
  // worker and whatever receives the result. Pi's Sign-in guide tells you to
  // "use this `uid` as the primary key for the user's account in your
  // system", which needs you to actually receive it.
  //
  // Pi's Developer Terms of Use §4 does restrict transferring uids/usernames
  // to outside parties -- if you relay this onward, that's a §4 transfer and
  // your obligation to handle.
  if (record.callback_url) {
    try {
      const res = await fetch(record.callback_url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ref: record.ref,
          verified: true,
          uid: me.uid,
          username: me.username,
        }),
      });
      if (!res.ok) {
        return error(`Callback delivery failed with status ${res.status}`, 502);
      }
    } catch (err) {
      return error(`Callback delivery failed: ${(err as Error).message}`, 502);
    }
  }

  // Web flow: hand the browser back to the app with a code its server can
  // exchange for the identity.
  if (record.redirect_uri) {
    const code = await issueCode(config, {
      ref: record.ref,
      uid: me.uid,
      username: me.username,
    });
    const target = new URL(record.redirect_uri);
    target.searchParams.set("code", code);
    return json({ status: "verified", redirect_url: target.toString() });
  }

  return json({ status: "verified" });
}
