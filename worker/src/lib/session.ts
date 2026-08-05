import type { Env, Platform, SessionRecord } from "../types";
import { putSession } from "./kv";

const SESSION_TTL_MS = 10 * 60 * 1000; // 10 minutes

export interface CreateSessionInput {
  platform: Platform;
  platform_user_id: string;
  guild_id: string;
  callback_url: string;
}

export interface CreatedSession {
  token: string;
  record: SessionRecord;
}

/**
 * Generate a URL-safe random session token.
 */
export function generateToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  let base64 = btoa(String.fromCharCode(...bytes));
  // URL-safe, no padding.
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function createSession(
  env: Env,
  input: CreateSessionInput,
): Promise<CreatedSession> {
  const token = generateToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
  const record: SessionRecord = {
    platform: input.platform,
    platform_user_id: input.platform_user_id,
    guild_id: input.guild_id,
    callback_url: input.callback_url,
    expires_at: expiresAt,
    used: false,
  };
  await putSession(env, token, record);
  return { token, record };
}

/**
 * A session is valid only if it exists, has not been used, and has not expired.
 */
export function isSessionExpired(record: SessionRecord): boolean {
  return Date.now() >= new Date(record.expires_at).getTime();
}
