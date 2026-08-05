import { describe, it, expect } from "vitest";
import {
  createSession,
  generateToken,
  getSession,
  isSessionExpired,
} from "../src/core/lib/session";
import type { SessionRecord } from "../src/core/types";
import { makeConfig } from "./helpers";

describe("generateToken", () => {
  it("produces URL-safe tokens with no padding", () => {
    for (let i = 0; i < 50; i++) {
      const t = generateToken();
      expect(t).toMatch(/^[A-Za-z0-9_-]+$/);
      expect(t).not.toContain("=");
      expect(t.length).toBeGreaterThan(20);
    }
  });

  it("produces unique tokens", () => {
    const set = new Set<string>();
    for (let i = 0; i < 200; i++) set.add(generateToken());
    expect(set.size).toBe(200);
  });
});

describe("isSessionExpired", () => {
  const base: Omit<SessionRecord, "expires_at"> = {
    ref: "r",
    callback_url: "https://cb.example",
    used: false,
  };

  it("returns false for a future expiry", () => {
    expect(
      isSessionExpired({ ...base, expires_at: new Date(Date.now() + 60_000).toISOString() }),
    ).toBe(false);
  });

  it("returns true for a past expiry", () => {
    expect(
      isSessionExpired({ ...base, expires_at: new Date(Date.now() - 1_000).toISOString() }),
    ).toBe(true);
  });
});

describe("createSession", () => {
  it("persists a fresh, unused session with a ~10 minute TTL", async () => {
    const config = makeConfig();
    const before = Date.now();
    const { token, record } = await createSession(config, {
      ref: "user-42",
      callback_url: "https://cb.example/verified",
    });

    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(record.used).toBe(false);
    expect(record.ref).toBe("user-42");

    const expiresMs = new Date(record.expires_at).getTime();
    expect(expiresMs).toBeGreaterThanOrEqual(before + 10 * 60 * 1000 - 1000);
    expect(expiresMs).toBeLessThanOrEqual(Date.now() + 10 * 60 * 1000 + 1000);

    expect(await getSession(config, token)).toEqual(record);
  });
});
