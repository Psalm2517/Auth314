import type { Env } from "../types";
import { error, json } from "../lib/http";
import { createSession, isSessionExpired } from "../lib/session";
import { getSession } from "../lib/kv";
import { isAuthorized } from "../lib/auth";

interface VerifyInitBody {
  platform?: string;
  platform_user_id?: string;
  guild_id?: string;
  callback_url?: string;
}

function parseVerifyInitBody(body: VerifyInitBody): { platform: string; platform_user_id: string; guild_id: string; callback_url: string } | Response {
  const { platform, platform_user_id, guild_id, callback_url } = body;

  if (!platform) return error("platform is required", 400);
  if (!platform_user_id) return error("platform_user_id is required", 400);
  if (!callback_url) return error("callback_url is required", 400);
  try {
    const parsed = new URL(callback_url);
    if (parsed.protocol !== "https:") return error("callback_url must be https", 400);
  } catch {
    return error("callback_url must be a valid URL", 400);
  }

  return { platform, platform_user_id, guild_id: guild_id ?? "", callback_url };
}

/**
 * POST /verify/init
 * Called by your own integrations, authenticated with the shared AUTH_SECRET.
 */
export async function handleVerifyInit(
  req: Request,
  env: Env,
): Promise<Response> {
  if (!isAuthorized(env, req)) {
    return error("Invalid or missing credentials", 401);
  }

  let body: VerifyInitBody;
  try {
    body = (await req.json()) as VerifyInitBody;
  } catch {
    return error("Invalid JSON body", 400);
  }

  const parsed = parseVerifyInitBody(body);
  if (parsed instanceof Response) return parsed;

  const { token, record } = await createSession(env, parsed);

  const verifyUrl = `${env.PORTAL_BASE_URL}/?session=${encodeURIComponent(token)}`;

  return json({
    verify_url: verifyUrl,
    session: token,
    expires_at: record.expires_at,
  });
}

/**
 * GET /verify/status?session=<token>
 * Read-only check your verify UI calls before starting the Pi sign-in flow, so
 * an invalid/expired/used session is rejected up front instead of only
 * after the user completes the entire OAuth round-trip. Does not consume
 * the session -- only /auth/callback marks it used.
 */
export async function handleVerifyStatus(
  req: Request,
  env: Env,
): Promise<Response> {
  const url = new URL(req.url);
  const session = url.searchParams.get("session");
  if (!session) return error("session is required", 400);

  const record = await getSession(env, session);
  if (!record) return error("Session not found or expired", 404);
  if (record.used) return error("Session already used", 409);
  if (isSessionExpired(record)) return error("Session expired", 410);

  return json({ valid: true });
}
