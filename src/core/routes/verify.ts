import type { Config } from "../types";
import { error, json, html } from "../lib/http";
import { isAuthorized, publicOrigin } from "../lib/auth";
import { buildAuthorizeUrl } from "../lib/pi";
import { errorPage } from "../lib/pages";
import { isAcceptableUrl } from "../lib/url";
import { redeemCode } from "../lib/code";
import { createSession, getSession, isSessionExpired } from "../lib/session";

interface VerifyInitBody {
  ref?: string;
  callback_url?: string;
  redirect_uri?: string;
}

/**
 * POST /verify/init
 * Called by your app's server, authenticated with AUTH_SECRET. Returns a
 * verify_url to send the user to.
 *
 * Supply `redirect_uri` to get the user sent back to your site afterwards
 * with a one-time code (web apps), `callback_url` to receive a webhook
 * (bots), or both.
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

  const { ref, callback_url, redirect_uri } = body;
  if (!callback_url && !redirect_uri) {
    return error("One of callback_url or redirect_uri is required", 400);
  }
  if (callback_url && !isAcceptableUrl(callback_url)) {
    return error("callback_url must be an https URL (http is allowed on loopback)", 400);
  }
  if (redirect_uri && !isAcceptableUrl(redirect_uri)) {
    return error("redirect_uri must be an https URL (http is allowed on loopback)", 400);
  }

  const { token, record } = await createSession(config, {
    ref: ref ?? "",
    callback_url,
    redirect_uri,
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

interface ExchangeBody {
  code?: string;
}

/**
 * POST /verify/exchange
 * Trades the one-time code from a redirect_uri landing for the verified
 * identity. Authenticated with AUTH_SECRET, so this runs on your server, not
 * in the browser. Codes are single-use and expire in two minutes.
 */
export async function handleExchange(req: Request, config: Config): Promise<Response> {
  if (!isAuthorized(config, req)) {
    return error("Invalid or missing credentials", 401);
  }

  let body: ExchangeBody;
  try {
    body = (await req.json()) as ExchangeBody;
  } catch {
    return error("Invalid JSON body", 400);
  }

  if (!body.code) return error("code is required", 400);

  const record = await redeemCode(config, body.code);
  if (!record) return error("Code not found, already used, or expired", 404);

  return json({
    ref: record.ref,
    uid: record.uid,
    username: record.username,
  });
}
