/** Minimal key-value storage contract. */
export interface SessionStore {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, ttlSeconds: number): Promise<void>;
  delete(key: string): Promise<void>;
}

/** Everything the core handler needs, assembled by the runtime entry point. */
export interface Config {
  /** Shared bearer token required by POST /verify/init and /verify/exchange. */
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
  /** Opaque caller-supplied value, handed back on completion. */
  ref: string;
  /** Webhook to POST the result to. Bot-style flow. */
  callback_url?: string;
  /** Where to send the browser afterwards, with a one-time code. Web flow. */
  redirect_uri?: string;
  expires_at: string; // ISO 8601
  used: boolean;
}

/** Short-lived record a redirect-flow code exchanges for. */
export interface CodeRecord {
  ref: string;
  uid: string;
  username: string;
}

/** Shape returned by GET https://api.minepi.com/v2/me */
export interface PiMeResponse {
  uid: string;
  username: string;
}
