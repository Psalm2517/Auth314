import { describe, it, expect } from "vitest";
import {
  handleVerifyInit,
  handleVerifyRedirect,
  handleVerifyStatus,
} from "../src/core/routes/verify";
import { createSession, getSession, putSession } from "../src/core/lib/session";
import { makeConfig, TEST_AUTH_SECRET, TEST_CLIENT_ID } from "./helpers";

const ORIGIN = "https://api.example";

function post(body: unknown, auth = TEST_AUTH_SECRET): Request {
  return new Request(`${ORIGIN}/verify/init`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${auth}`,
    },
    body: JSON.stringify(body),
  });
}

describe("POST /verify/init", () => {
  it("rejects a missing credential", async () => {
    const res = await handleVerifyInit(
      new Request(`${ORIGIN}/verify/init`, {
        method: "POST",
        body: JSON.stringify({ callback_url: "https://cb.example" }),
      }),
      makeConfig(),
    );
    expect(res.status).toBe(401);
  });

  it("rejects a wrong credential", async () => {
    const res = await handleVerifyInit(
      post({ callback_url: "https://cb.example" }, "wrong"),
      makeConfig(),
    );
    expect(res.status).toBe(401);
  });

  it("requires callback_url", async () => {
    const res = await handleVerifyInit(post({ ref: "x" }), makeConfig());
    expect(res.status).toBe(400);
  });

  it("rejects a non-https callback_url", async () => {
    const res = await handleVerifyInit(
      post({ callback_url: "http://cb.example" }),
      makeConfig(),
    );
    expect(res.status).toBe(400);
  });

  it("rejects a malformed callback_url", async () => {
    const res = await handleVerifyInit(post({ callback_url: "not-a-url" }), makeConfig());
    expect(res.status).toBe(400);
  });

  it("rejects an invalid JSON body", async () => {
    const req = new Request(`${ORIGIN}/verify/init`, {
      method: "POST",
      headers: { Authorization: `Bearer ${TEST_AUTH_SECRET}` },
      body: "{not json",
    });
    expect((await handleVerifyInit(req, makeConfig())).status).toBe(400);
  });

  it("creates a session and returns a verify_url on this origin", async () => {
    const config = makeConfig();
    const res = await handleVerifyInit(
      post({ ref: "user-1", callback_url: "https://cb.example/verified" }),
      config,
    );
    expect(res.status).toBe(200);

    const data = (await res.json()) as {
      verify_url: string;
      session: string;
      expires_at: string;
    };
    expect(data.session).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(data.verify_url).toBe(
      `${ORIGIN}/verify?session=${encodeURIComponent(data.session)}`,
    );

    const stored = await getSession(config, data.session);
    expect(stored?.used).toBe(false);
    expect(stored?.ref).toBe("user-1");
  });

  it("defaults ref to an empty string when omitted", async () => {
    const config = makeConfig();
    const res = await handleVerifyInit(
      post({ callback_url: "https://cb.example" }),
      config,
    );
    const { session } = (await res.json()) as { session: string };
    expect((await getSession(config, session))?.ref).toBe("");
  });

  it("honours publicUrl over the request origin", async () => {
    const config = makeConfig({ publicUrl: "https://auth.example.com" });
    const res = await handleVerifyInit(post({ callback_url: "https://cb.example" }), config);
    const { verify_url } = (await res.json()) as { verify_url: string };
    expect(verify_url.startsWith("https://auth.example.com/verify?")).toBe(true);
  });
});

function getReq(session: string | null, path = "/verify"): Request {
  const url = new URL(`${ORIGIN}${path}`);
  if (session !== null) url.searchParams.set("session", session);
  return new Request(url.toString());
}

describe("GET /verify", () => {
  it("redirects a valid session to Pi Sign-in", async () => {
    const config = makeConfig();
    const { token } = await createSession(config, {
      ref: "r",
      callback_url: "https://cb.example",
    });

    const res = await handleVerifyRedirect(getReq(token), config);
    expect(res.status).toBe(302);

    const location = new URL(res.headers.get("Location") as string);
    expect(location.origin + location.pathname).toBe(
      "https://accounts.pinet.com/oauth/authorize",
    );
    expect(location.searchParams.get("response_type")).toBe("token");
    expect(location.searchParams.get("client_id")).toBe(TEST_CLIENT_ID);
    expect(location.searchParams.get("redirect_uri")).toBe(`${ORIGIN}/callback`);
    expect(location.searchParams.get("scope")).toBe("username");
    // The session token doubles as the OAuth state parameter.
    expect(location.searchParams.get("state")).toBe(token);
  });

  it("errors without a session", async () => {
    expect((await handleVerifyRedirect(getReq(null), makeConfig())).status).toBe(400);
  });

  it("404s an unknown session", async () => {
    expect((await handleVerifyRedirect(getReq("nope"), makeConfig())).status).toBe(404);
  });

  it("409s an already-used session", async () => {
    const config = makeConfig();
    const { token, record } = await createSession(config, {
      ref: "r",
      callback_url: "https://cb.example",
    });
    await putSession(config, token, { ...record, used: true });
    expect((await handleVerifyRedirect(getReq(token), config)).status).toBe(409);
  });

  it("410s an expired session", async () => {
    const config = makeConfig();
    const { token, record } = await createSession(config, {
      ref: "r",
      callback_url: "https://cb.example",
    });
    await putSession(config, token, {
      ...record,
      expires_at: new Date(Date.now() - 1000).toISOString(),
    });
    expect((await handleVerifyRedirect(getReq(token), config)).status).toBe(410);
  });
});

describe("GET /verify/status", () => {
  it("requires a session param", async () => {
    expect((await handleVerifyStatus(getReq(null, "/verify/status"), makeConfig())).status).toBe(400);
  });

  it("404s for an unknown session", async () => {
    expect((await handleVerifyStatus(getReq("nope", "/verify/status"), makeConfig())).status).toBe(404);
  });

  it("returns valid: true for a fresh session and does not consume it", async () => {
    const config = makeConfig();
    const { token } = await createSession(config, {
      ref: "r",
      callback_url: "https://cb.example",
    });
    const res = await handleVerifyStatus(getReq(token, "/verify/status"), config);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ valid: true });
    expect((await getSession(config, token))?.used).toBe(false);
  });
});
