import type { Config } from "../types";

export interface VerificationEntry {
  timestamp: string;
  ref: string;
}

const MAX_ENTRIES = 200;
const LOG_KEY = "verlog:recent";
const LOG_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

/**
 * A rolling log of recent verifications, for debugging a deployment. Holds
 * only the caller's own opaque ref -- never any Pi identity.
 */
export async function logVerification(config: Config, entry: VerificationEntry): Promise<void> {
  const raw = await config.store.get(LOG_KEY);
  const entries: VerificationEntry[] = raw ? JSON.parse(raw) : [];
  entries.unshift(entry);
  if (entries.length > MAX_ENTRIES) entries.length = MAX_ENTRIES;
  await config.store.put(LOG_KEY, JSON.stringify(entries), LOG_TTL_SECONDS);
}
