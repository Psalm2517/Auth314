import { handleRequest } from "../../core/handler";
import type { Config, SessionStore } from "../../core/types";

export const config = { runtime: "edge" };

// Declared locally so this file doesn't drag @types/node into a project that
// otherwise targets Workers/edge runtimes.
declare const process: { env: Record<string, string | undefined> };

/**
 * Upstash Redis over its REST API -- works in edge runtimes (no TCP). Vercel
 * KV is Upstash under the hood and exposes the same REST credentials, so
 * either KV_REST_API_* or UPSTASH_REDIS_REST_* env vars work.
 */
function upstashStore(url: string, token: string): SessionStore {
  async function command<T>(args: (string | number)[]): Promise<T> {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(args),
    });
    if (!res.ok) {
      throw new Error(`Upstash ${args[0]} failed: ${res.status} ${await res.text()}`);
    }
    return ((await res.json()) as { result: T }).result;
  }

  return {
    get: (key) => command<string | null>(["GET", key]),
    put: async (key, value, ttlSeconds) => {
      await command(["SET", key, value, "EX", ttlSeconds]);
    },
    delete: async (key) => {
      await command(["DEL", key]);
    },
  };
}

function required(name: string, ...candidates: (string | undefined)[]): string {
  const value = candidates.find((v) => v);
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export default async function handler(request: Request): Promise<Response> {
  const env = process.env;

  const cfg: Config = {
    authSecret: required("AUTH_SECRET", env.AUTH_SECRET),
    piClientId: required("PI_CLIENT_ID", env.PI_CLIENT_ID),
    publicUrl: env.PUBLIC_URL,
    store: upstashStore(
      required("KV_REST_API_URL", env.KV_REST_API_URL, env.UPSTASH_REDIS_REST_URL),
      required("KV_REST_API_TOKEN", env.KV_REST_API_TOKEN, env.UPSTASH_REDIS_REST_TOKEN),
    ),
  };

  return handleRequest(request, cfg);
}
