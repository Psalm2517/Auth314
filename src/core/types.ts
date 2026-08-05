/** Minimal key-value storage contract. Implemented per platform. */
export interface SessionStore {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, ttlSeconds: number): Promise<void>;
  delete(key: string): Promise<void>;
}

/** Everything the core handler needs, assembled by a platform adapter. */
export interface Config {
  /** Shared bearer token required by POST /verify/init. */
  authSecret: string;
  /** Pi OAuth client id, from the Pi Developer Portal. */
  piClientId: string;
  /**
   * Public base URL of this deployment, used to build the OAuth redirect_uri.
   * Defaults to the incoming request's origin, which is correct unless you're
   * behind a proxy that rewrites Host.
   */
  publicUrl?: string;
  store: SessionStore;
}

export interface SessionRecord {
  /** Opaque caller-supplied value, echoed back in the webhook. */
  ref: string;
  callback_url: string;
  expires_at: string; // ISO 8601
  used: boolean;
}

/** Shape returned by GET https://api.minepi.com/v2/me */
export interface PiMeResponse {
  uid: string;
  username: string;
}
