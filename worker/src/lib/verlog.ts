import type { Env } from "../types";

export interface VerificationEntry {
  timestamp: string;
  platform: string;
  guild_id: string;
  platform_user_id: string;
}

const MAX_ENTRIES = 200;
const LOG_KEY = "verlog:recent";

/** A rolling log of the most recent verifications, for local debugging. */
export async function logVerification(env: Env, entry: VerificationEntry): Promise<void> {
  const raw = await env.AUTH314_KV.get(LOG_KEY);
  const entries: VerificationEntry[] = raw ? JSON.parse(raw) : [];
  entries.unshift(entry);
  if (entries.length > MAX_ENTRIES) entries.length = MAX_ENTRIES;
  await env.AUTH314_KV.put(LOG_KEY, JSON.stringify(entries));
}
