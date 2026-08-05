import { handleRequest } from "../../core/handler";
import type { Config, SessionStore } from "../../core/types";

export interface Env {
  AUTH314_KV: KVNamespace;
  AUTH_SECRET: string;
  PI_CLIENT_ID: string;
  PUBLIC_URL?: string;
}

function kvStore(kv: KVNamespace): SessionStore {
  return {
    get: (key) => kv.get(key),
    put: (key, value, ttlSeconds) => kv.put(key, value, { expirationTtl: ttlSeconds }),
    delete: (key) => kv.delete(key),
  };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const config: Config = {
      authSecret: env.AUTH_SECRET,
      piClientId: env.PI_CLIENT_ID,
      publicUrl: env.PUBLIC_URL,
      store: kvStore(env.AUTH314_KV),
    };
    return handleRequest(request, config);
  },
};
