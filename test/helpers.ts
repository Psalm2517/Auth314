import type { Config, SessionStore } from "../src/core/types";

/** In-memory SessionStore for tests. */
export class MemoryStore implements SessionStore {
  private store = new Map<string, string>();

  async get(key: string): Promise<string | null> {
    return this.store.has(key) ? (this.store.get(key) as string) : null;
  }

  async put(key: string, value: string, _ttlSeconds: number): Promise<void> {
    this.store.set(key, value);
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }
}

export const TEST_AUTH_SECRET = "test-auth-secret";
export const TEST_CLIENT_ID = "test-client-id";

export function makeConfig(overrides: Partial<Config> = {}): Config {
  return {
    authSecret: TEST_AUTH_SECRET,
    piClientId: TEST_CLIENT_ID,
    store: new MemoryStore(),
    ...overrides,
  };
}
