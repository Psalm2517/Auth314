export interface Env {
  // KV binding
  AUTH314_KV: KVNamespace;

  // Secrets / config (see .env.example)
  PI_API_KEY: string;
  // Shared bearer token your own integrations authenticate with.
  AUTH_SECRET: string;
  // Base URL of your own verify UI, where users complete Pi sign-in.
  PORTAL_BASE_URL: string;
}

export type Platform = string;

export interface SessionRecord {
  platform: Platform;
  platform_user_id: string;
  guild_id: string;
  callback_url: string;
  expires_at: string; // ISO 8601
  used: boolean;
}

export interface IdentityRecord {
  pi_uid: string;
  pi_username: string;
  platform: Platform;
  platform_user_id: string;
  guild_id: string;
  callback_url: string;
  verified_at: string; // ISO 8601
}

// Shape returned by GET https://api.minepi.com/v2/me
export interface PiMeResponse {
  uid: string;
  username: string;
}
