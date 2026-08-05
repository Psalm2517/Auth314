import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { handleAuthCallback, handleCallbackPage } from "../src/core/routes/callback";
import { createSession, getSession, putSession } from "../src/core/lib/session";
import { makeConfig } from "./helpers";
import type { Config, SessionRecord } from "../src/core/types";

const ORIGIN = "https://api.example";

function post(body: unknown): Request {
  return new Request(`${ORIGIN}/auth/callback`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function seedSession(
  config: Config,
  overrides: Partial<SessionRecord> = {},
): Promise<string> {
  const { token, record } = await createSession(config, {
    ref: "user-1",
    callback_url: "https://cb.example/verified",
  });
  if (Object.keys(overrides).length) {
    await putSession(config, token, { ...record, ...overrides });
  }
  return token;
}

/** Pi /me returns an identity; the callback_url returns 200. */
function mockHappyFetch() {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.includes("api.minepi.com/v2/me")) {
      return new Response(JSON.stringify({ uid: "pi-uid-1", username: "pioneer" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response(null, { status: 200 });
  });
}

describe("GET /callback", () => {
  it("serves a page that posts the fragment token back", () => {
    const res = handleCallbackPage(new Request(`${ORIGIN}/callback`), makeConfig());
    expect(res.headers.get("Content-Type")).toContain("text/html");
    return res.text().then((body) => {
      expect(body).toContain("location.hash");
      expect(body).toContain("access_token");
      expect(body).toContain(`${JSON.stringify(ORIGIN)} + "/auth/callback"`);
    });
  });
});

describe("POST /auth/callback", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", mockHappyFetch());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("requires access_token and session", async () => {
    expect((await handleAuthCallback(post({ session: "x" }), makeConfig())).status).toBe(400);
    expect((await handleAuthCallback(post({ access_token: "x" }), makeConfig())).status).toBe(400);
  });

  it("404s for an unknown session", async () => {
    const res = await handleAuthCallback(
      post({ access_token: "tok", session: "nope" }),
      makeConfig(),
    );
    expect(res.status).toBe(404);
  });

  it("verifies, delivers the webhook, and marks the session used", async () => {
    const config = makeConfig();
    const token = await seedSession(config);
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;

    const res = await handleAuthCallback(
      post({ access_token: "user-token", session: token }),
      config,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "verified", username: "pioneer" });

    expect((await getSession(config, token))?.used).toBe(true);

    // /me called with the user's bearer token.
    const meCall = fetchMock.mock.calls.find((c) => String(c[0]).includes("/v2/me"));
    expect((meCall?.[1] as RequestInit).headers).toMatchObject({
      Authorization: "Bearer user-token",
    });

    // Webhook carries the ref and a verified flag -- no Pi identity.
    const cbCall = fetchMock.mock.calls.find((c) => String(c[0]).includes("cb.example"));
    expect(JSON.parse((cbCall?.[1] as RequestInit).body as string)).toEqual({
      ref: "user-1",
      verified: true,
    });
  });

  it("rejects an already-used session", async () => {
    const config = makeConfig();
    const token = await seedSession(config, { used: true });
    expect(
      (await handleAuthCallback(post({ access_token: "tok", session: token }), config)).status,
    ).toBe(409);
  });

  it("cannot be replayed after a successful verification", async () => {
    const config = makeConfig();
    const token = await seedSession(config);
    expect(
      (await handleAuthCallback(post({ access_token: "tok", session: token }), config)).status,
    ).toBe(200);
    expect(
      (await handleAuthCallback(post({ access_token: "tok", session: token }), config)).status,
    ).toBe(409);
  });

  it("rejects an expired session", async () => {
    const config = makeConfig();
    const token = await seedSession(config, {
      expires_at: new Date(Date.now() - 1000).toISOString(),
    });
    expect(
      (await handleAuthCallback(post({ access_token: "tok", session: token }), config)).status,
    ).toBe(410);
  });

  it("returns 401 when Pi rejects the access token", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("unauthorized", { status: 401 })));
    const config = makeConfig();
    const token = await seedSession(config);
    const res = await handleAuthCallback(post({ access_token: "bad", session: token }), config);
    expect(res.status).toBe(401);
    // Consumed before the Pi call, so a retry is rejected.
    expect((await getSession(config, token))?.used).toBe(true);
  });

  it("returns 502 when webhook delivery fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        if (String(input).includes("/v2/me")) {
          return new Response(JSON.stringify({ uid: "u", username: "n" }), { status: 200 });
        }
        return new Response(null, { status: 500 });
      }),
    );
    const config = makeConfig();
    const token = await seedSession(config);
    expect(
      (await handleAuthCallback(post({ access_token: "tok", session: token }), config)).status,
    ).toBe(502);
  });
});
