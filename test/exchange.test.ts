import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { handleVerifyInit, handleExchange } from "../src/core/routes/verify";
import { handleAuthCallback } from "../src/core/routes/callback";
import { makeConfig, TEST_AUTH_SECRET } from "./helpers";
import type { Config } from "../src/core/types";

const ORIGIN = "https://api.example";

function authed(path: string, body: unknown, auth = TEST_AUTH_SECRET): Request {
  return new Request(`${ORIGIN}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${auth}`,
    },
    body: JSON.stringify(body),
  });
}

function mockPi() {
  return vi.fn(async (input: RequestInfo | URL) => {
    if (String(input).includes("api.minepi.com/v2/me")) {
      return new Response(JSON.stringify({ uid: "pi-uid-1", username: "pioneer" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response(null, { status: 200 });
  });
}

/** Runs init -> callback and returns the redirect_url handed to the browser. */
async function runRedirectFlow(config: Config, redirect_uri: string, ref = "u1") {
  const initRes = await handleVerifyInit(
    authed("/verify/init", { ref, redirect_uri }),
    config,
  );
  const { session } = (await initRes.json()) as { session: string };

  const cbRes = await handleAuthCallback(
    authed("/auth/callback", { access_token: "tok", session }),
    config,
  );
  return cbRes;
}

describe("POST /verify/init target validation", () => {
  it("requires at least one of callback_url or redirect_uri", async () => {
    const res = await handleVerifyInit(authed("/verify/init", { ref: "x" }), makeConfig());
    expect(res.status).toBe(400);
  });

  it("accepts redirect_uri alone", async () => {
    const res = await handleVerifyInit(
      authed("/verify/init", { redirect_uri: "https://app.example/signin/done" }),
      makeConfig(),
    );
    expect(res.status).toBe(200);
  });

  it("rejects a non-https redirect_uri", async () => {
    const res = await handleVerifyInit(
      authed("/verify/init", { redirect_uri: "http://app.example/done" }),
      makeConfig(),
    );
    expect(res.status).toBe(400);
  });

  it("allows http on loopback so local development works", async () => {
    const res = await handleVerifyInit(
      authed("/verify/init", { redirect_uri: "http://localhost:3000/done" }),
      makeConfig(),
    );
    expect(res.status).toBe(200);
  });
});

describe("redirect flow", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", mockPi());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns a redirect_url carrying a code, and fires no webhook", async () => {
    const config = makeConfig();
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;

    const res = await runRedirectFlow(config, "https://app.example/signin/done");
    expect(res.status).toBe(200);

    const { redirect_url } = (await res.json()) as { redirect_url: string };
    const url = new URL(redirect_url);
    expect(url.origin + url.pathname).toBe("https://app.example/signin/done");
    expect(url.searchParams.get("code")).toMatch(/^[A-Za-z0-9_-]+$/);

    // Only Pi was called, since there is no callback_url on this session.
    expect(fetchMock.mock.calls.every((c) => String(c[0]).includes("minepi.com"))).toBe(true);
  });

  it("preserves query already present on the redirect_uri", async () => {
    const config = makeConfig();
    const res = await runRedirectFlow(config, "https://app.example/done?next=%2Fdashboard");
    const { redirect_url } = (await res.json()) as { redirect_url: string };
    const url = new URL(redirect_url);
    expect(url.searchParams.get("next")).toBe("/dashboard");
    expect(url.searchParams.get("code")).toBeTruthy();
  });

  it("exchanges the code for the verified identity, once", async () => {
    const config = makeConfig();
    const res = await runRedirectFlow(config, "https://app.example/done", "row-42");
    const { redirect_url } = (await res.json()) as { redirect_url: string };
    const code = new URL(redirect_url).searchParams.get("code") as string;

    const first = await handleExchange(authed("/verify/exchange", { code }), config);
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({
      ref: "row-42",
      uid: "pi-uid-1",
      username: "pioneer",
    });

    // Single use.
    const second = await handleExchange(authed("/verify/exchange", { code }), config);
    expect(second.status).toBe(404);
  });

  it("also fires the webhook when both targets are set", async () => {
    const config = makeConfig();
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;

    const initRes = await handleVerifyInit(
      authed("/verify/init", {
        ref: "both",
        redirect_uri: "https://app.example/done",
        callback_url: "https://cb.example/hook",
      }),
      config,
    );
    const { session } = (await initRes.json()) as { session: string };
    const res = await handleAuthCallback(
      authed("/auth/callback", { access_token: "tok", session }),
      config,
    );

    expect(((await res.json()) as { redirect_url?: string }).redirect_url).toBeTruthy();
    const hook = fetchMock.mock.calls.find((c) => String(c[0]).includes("cb.example"));
    expect(JSON.parse((hook?.[1] as RequestInit).body as string)).toEqual({
      ref: "both",
      verified: true,
      uid: "pi-uid-1",
      username: "pioneer",
    });
  });
});

describe("POST /verify/exchange", () => {
  it("rejects an unauthenticated caller", async () => {
    const res = await handleExchange(
      authed("/verify/exchange", { code: "x" }, "wrong"),
      makeConfig(),
    );
    expect(res.status).toBe(401);
  });

  it("requires a code", async () => {
    const res = await handleExchange(authed("/verify/exchange", {}), makeConfig());
    expect(res.status).toBe(400);
  });

  it("404s an unknown code", async () => {
    const res = await handleExchange(authed("/verify/exchange", { code: "nope" }), makeConfig());
    expect(res.status).toBe(404);
  });
});
