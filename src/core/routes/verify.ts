import type { Config } from "../types";
import { error, json, html } from "../lib/http";
import { isAuthorized, publicOrigin } from "../lib/auth";
import { buildAuthorizeUrl } from "../lib/pi";
import { errorPage } from "../lib/pages";
import { createSession, getSession, isSessionExpired } from "../lib/session";

interface VerifyInitBody {
  ref?: string;
  callback_url?: string;
}

/**
 * POST /verify/init
 * Called by your own integration, authenticated with AUTH_SECRET. Returns a
 * verify_url to send the user to.
 */
export async function handleVerifyInit(req: Request, config: Config): Promise<Response> {
  if (!isAuthorized(config, req)) {
    return error("Invalid or missing credentials", 401);
  }

  let body: VerifyInitBody;
  try {
    body = (await req.json()) as VerifyInitBody;
  } catch {
    return error("Invalid JSON body", 400);
  }

  const { ref, callback_url } = body;
  if (!callback_url) return error("callback_url is required", 400);
  try {
    if (new URL(callback_url).protocol !== "https:") {
      return error("callback_url must be https", 400);
    }
  } catch {
    return error("callback_url must be a valid URL", 400);
  }

  const { token, record } = await createSession(config, {
    ref: ref ?? "",
    callback_url,
  });

  return json({
    verify_url: `${publicOrigin(config, req)}/verify?session=${encodeURIComponent(token)}`,
    session: token,
    expires_at: record.expires_at,
  });
}

/**
 * GET /verify?session=<token>
 * Where the end user lands. Redirects straight to Pi Sign-in -- the session
 * token doubles as the OAuth `state` parameter, so it survives the round trip
 * and guards against CSRF.
 */
export async function handleVerifyRedirect(req: Request, config: Config): Promise<Response> {
  const session = new URL(req.url).searchParams.get("session");
  if (!session) {
    return html(errorPage("This verification link is missing its session."), 400);
  }

  const record = await getSession(config, session);
  if (!record) {
    return html(errorPage("This verification link is invalid or has expired."), 404);
  }
  if (record.used) {
    return html(errorPage("This verification link has already been used."), 409);
  }
  if (isSessionExpired(record)) {
    return html(errorPage("This verification link has expired."), 410);
  }

  const redirectUri = `${publicOrigin(config, req)}/callback`;
  return Response.redirect(buildAuthorizeUrl(config, redirectUri, session), 302);
}
