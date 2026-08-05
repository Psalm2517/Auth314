import { describe, it, expect } from "vitest";
import { handleVerifyInit, handleVerifyStatus } from "../src/routes/verify";
import { getSession, putSession } from "../src/lib/kv";
import { createSession } from "../src/lib/session";
import { makeEnv, TEST_AUTH_SECRET } from "./helpers";

function post(body: unknown): Request {
  return new Request("https://api.example/verify/init", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${TEST_AUTH_SECRET}`,
    },
    body: JSON.stringify(body),
  });
}

describe("POST /verify/init validation", () => {
  it("rejects a missing credential", async () => {
    const res = await handleVerifyInit(
      new Request("https://api.example/verify/init", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platform: "discord",
          platform_user_id: "1",
          callback_url: "https://cb.example",
        }),
      }),
      makeEnv(),
    );
    expect(res.status).toBe(401);
  });

  it("rejects a missing platform_user_id", async () => {
    const env = makeEnv();
    const res = await handleVerifyInit(
      post({ platform: "discord", callback_url: "https://cb.example" }),
      env,
    );
    expect(res.status).toBe(400);
  });

  it("rejects a non-https callback_url", async () => {
    const env = makeEnv();
    const res = await handleVerifyInit(
      post({
        platform: "discord",
        platform_user_id: "1",
        callback_url: "http://cb.example",
      }),
      env,
    );
    expect(res.status).toBe(400);
  });

  it("rejects a malformed callback_url", async () => {
    const env = makeEnv();
    const res = await handleVerifyInit(
      post({
        platform: "discord",
        platform_user_id: "1",
        callback_url: "not-a-url",
      }),
      env,
    );
    expect(res.status).toBe(400);
  });

  it("rejects an invalid JSON body", async () => {
    const env = makeEnv();
    const req = new Request("https://api.example/verify/init", {
      method: "POST",
      headers: { Authorization: `Bearer ${TEST_AUTH_SECRET}` },
      body: "{not json",
    });
    const res = await handleVerifyInit(req, env);
    expect(res.status).toBe(400);
  });

  it("creates a session and returns a verify_url", async () => {
    const env = makeEnv();
    const res = await handleVerifyInit(
      post({
        platform: "discord",
        platform_user_id: "123456789",
        guild_id: "987654321",
        callback_url: "https://cb.example/verified",
      }),
      env,
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      verify_url: string;
      session: string;
      expires_at: string;
    };
    expect(data.session).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(data.verify_url).toBe(
      `${env.PORTAL_BASE_URL}/?session=${encodeURIComponent(data.session)}`,
    );

    const stored = await getSession(env, data.session);
    expect(stored?.used).toBe(false);
    expect(stored?.platform).toBe("discord");
    expect(stored?.guild_id).toBe("987654321");
  });

  it("sets CORS headers on responses", async () => {
    const env = makeEnv();
    const res = await handleVerifyInit(
      post({
        platform: "discord",
        platform_user_id: "1",
        callback_url: "https://cb.example",
      }),
      env,
    );
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });
});

function statusReq(session: string | null): Request {
  const url = new URL("https://api.example/verify/status");
  if (session !== null) url.searchParams.set("session", session);
  return new Request(url.toString());
}

describe("GET /verify/status", () => {
  it("requires a session param", async () => {
    const res = await handleVerifyStatus(statusReq(null), makeEnv());
    expect(res.status).toBe(400);
  });

  it("404s for an unknown session", async () => {
    const res = await handleVerifyStatus(statusReq("nope"), makeEnv());
    expect(res.status).toBe(404);
  });

  it("returns valid: true for a fresh session", async () => {
    const env = makeEnv();
    const { token } = await createSession(env, {
      platform: "discord",
      platform_user_id: "1",
      guild_id: "g",
      callback_url: "https://cb.example",
    });
    const res = await handleVerifyStatus(statusReq(token), env);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ valid: true });
  });

  it("409s for an already-used session", async () => {
    const env = makeEnv();
    const { token, record } = await createSession(env, {
      platform: "discord",
      platform_user_id: "1",
      guild_id: "g",
      callback_url: "https://cb.example",
    });
    await putSession(env, token, { ...record, used: true });
    const res = await handleVerifyStatus(statusReq(token), env);
    expect(res.status).toBe(409);
  });

  it("410s for an expired session", async () => {
    const env = makeEnv();
    const { token, record } = await createSession(env, {
      platform: "discord",
      platform_user_id: "1",
      guild_id: "g",
      callback_url: "https://cb.example",
    });
    await putSession(env, token, {
      ...record,
      expires_at: new Date(Date.now() - 1000).toISOString(),
    });
    const res = await handleVerifyStatus(statusReq(token), env);
    expect(res.status).toBe(410);
  });

  it("does not consume the session", async () => {
    const env = makeEnv();
    const { token } = await createSession(env, {
      platform: "discord",
      platform_user_id: "1",
      guild_id: "g",
      callback_url: "https://cb.example",
    });
    await handleVerifyStatus(statusReq(token), env);
    expect((await getSession(env, token))?.used).toBe(false);
  });
});
