import type { Env, IdentityRecord } from "../types";
import { error, json } from "../lib/http";
import { getSession, markSessionUsed, putIdentity, getIdentity } from "../lib/kv";
import { isSessionExpired } from "../lib/session";
import { fetchPiMe, PiApiError } from "../lib/pi";
import { logVerification } from "../lib/verlog";

interface AuthCallbackBody {
  access_token?: string;
  session?: string;
}

/**
 * POST /auth/callback
 * Called by your verify UI after extracting the access token from the OAuth
 * redirect fragment.
 */
export async function handleAuthCallback(
  req: Request,
  env: Env,
): Promise<Response> {
  let body: AuthCallbackBody;
  try {
    body = (await req.json()) as AuthCallbackBody;
  } catch {
    return error("Invalid JSON body", 400);
  }

  const { access_token, session } = body;
  if (!access_token) return error("access_token is required", 400);
  if (!session) return error("session is required", 400);

  // 1. Look up session, reject if missing, expired, or already used.
  const record = await getSession(env, session);
  if (!record) return error("Session not found or expired", 404);
  if (record.used) return error("Session already used", 409);
  if (isSessionExpired(record)) return error("Session expired", 410);

  // 2. Mark session as used immediately (one-time use guard).
  await markSessionUsed(env, session, record);

  // 3. Verify the access token against the Pi API.
  let me;
  try {
    me = await fetchPiMe(env, access_token);
  } catch (err) {
    const status = err instanceof PiApiError ? 401 : 502;
    return error(
      `Pi verification failed: ${(err as Error).message}`,
      status,
    );
  }

  // 4. 1-to-1 enforcement: if this Pi UID already has a verified association
  // with a different platform user or guild, revoke the old one first.
  const existing = await getIdentity(env, me.uid);
  if (
    existing &&
    existing.callback_url &&
    (existing.platform_user_id !== record.platform_user_id ||
      existing.guild_id !== record.guild_id ||
      existing.platform !== record.platform)
  ) {
    // Fire revocation to the old integration (fire-and-forget -- a failed
    // revocation must not block the new verification).
    fetch(existing.callback_url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        platform_user_id: existing.platform_user_id,
        guild_id: existing.guild_id,
        verified: false,
      }),
    }).catch(() => {});
  }

  // 5. Store updated identity mapping in KV.
  const identity: IdentityRecord = {
    pi_uid: me.uid,
    pi_username: me.username,
    platform: record.platform,
    platform_user_id: record.platform_user_id,
    guild_id: record.guild_id,
    callback_url: record.callback_url,
    verified_at: new Date().toISOString(),
  };
  await putIdentity(env, identity);

  // 6. POST the result to the integration's callback_url.
  //
  // Pi identity (pi_uid, pi_username) is never sent to integrations, per Pi
  // Developer ToS §4 -- only a verified signal.
  const callbackPayload: Record<string, unknown> = {
    platform_user_id: record.platform_user_id,
    guild_id: record.guild_id,
    verified: true,
  };

  // 7. Log the verification. This happens regardless of whether callback
  // delivery below succeeds -- the Pi sign-in itself is already complete at
  // this point, so an unreachable webhook must not erase that fact.
  logVerification(env, {
    timestamp: new Date().toISOString(),
    platform: record.platform,
    guild_id: record.guild_id,
    platform_user_id: record.platform_user_id,
  }).catch(() => {});

  try {
    const cbRes = await fetch(record.callback_url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(callbackPayload),
    });
    if (!cbRes.ok) {
      return error(
        `Callback delivery failed with status ${cbRes.status}`,
        502,
      );
    }
  } catch (err) {
    return error(
      `Callback delivery failed: ${(err as Error).message}`,
      502,
    );
  }

  // 8. Return success to the verify UI.
  return json({
    status: "verified",
    pi_username: me.username,
    platform: record.platform,
  });
}
