import { handleRequest } from "./core/handler";
import { json } from "./core/lib/http";
import type { Config, SessionStore } from "./core/types";

export interface Env {
  /** Required. Created for you on first deploy. */
  AUTH314_KV: KVNamespace;
  /** Required. Bearer token your server authenticates with. */
  AUTH_SECRET: string;
  /** Required. Pi OAuth client id from the Pi Developer Portal. */
  PI_CLIENT_ID: string;
  /** Optional. Only needed behind a proxy that rewrites Host. */
  PUBLIC_URL?: string;
}

function kvStore(kv: KVNamespace): SessionStore {
  return {
    get: (key) => kv.get(key),
    put: (key, value, ttlSeconds) => kv.put(key, value, { expirationTtl: ttlSeconds }),
    delete: (key) => kv.delete(key),
  };
}

/**
 * Fail loudly on a half-configured deployment. Without this, a missing
 * PI_CLIENT_ID surfaces as a confusing error from Pi's authorize page, and a
 * missing AUTH_SECRET would leave every request unauthorized with no hint why.
 */
function missingConfig(env: Env): string[] {
  const missing: string[] = [];
  if (!env.AUTH_SECRET) missing.push("AUTH_SECRET");
  if (!env.PI_CLIENT_ID) missing.push("PI_CLIENT_ID");
  if (!env.AUTH314_KV) missing.push("AUTH314_KV (KV namespace binding)");
  return missing;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const missing = missingConfig(env);
    if (missing.length) {
      return json(
        {
          error: "Auth314 is not fully configured",
          missing,
          help: "Run `npm run setup`, or see the Setup section of the README.",
        },
        500,
      );
    }

    const config: Config = {
      authSecret: env.AUTH_SECRET,
      piClientId: env.PI_CLIENT_ID,
      publicUrl: env.PUBLIC_URL,
      store: kvStore(env.AUTH314_KV),
    };
    return handleRequest(request, config);
  },
};
