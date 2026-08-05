import type { Config, SessionRecord } from "../types";

const SESSION_TTL_MS = 10 * 60 * 1000; // 10 minutes
const SESSION_TTL_SECONDS = 10 * 60;

function sessionKey(token: string): string {
  return `session:${token}`;
}

/** Generate a URL-safe random session token. */
export function generateToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  const base64 = btoa(String.fromCharCode(...bytes));
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export interface CreatedSession {
  token: string;
  record: SessionRecord;
}

export async function createSession(
  config: Config,
  input: { ref: string; callback_url: string },
): Promise<CreatedSession> {
  const token = generateToken();
  const record: SessionRecord = {
    ref: input.ref,
    callback_url: input.callback_url,
    expires_at: new Date(Date.now() + SESSION_TTL_MS).toISOString(),
    used: false,
  };
  await config.store.put(sessionKey(token), JSON.stringify(record), SESSION_TTL_SECONDS);
  return { token, record };
}

export async function getSession(
  config: Config,
  token: string,
): Promise<SessionRecord | null> {
  const raw = await config.store.get(sessionKey(token));
  return raw ? (JSON.parse(raw) as SessionRecord) : null;
}

export async function putSession(
  config: Config,
  token: string,
  record: SessionRecord,
): Promise<void> {
  await config.store.put(sessionKey(token), JSON.stringify(record), SESSION_TTL_SECONDS);
}

export async function markSessionUsed(
  config: Config,
  token: string,
  record: SessionRecord,
): Promise<void> {
  await putSession(config, token, { ...record, used: true });
}

export function isSessionExpired(record: SessionRecord): boolean {
  return Date.now() >= new Date(record.expires_at).getTime();
}
