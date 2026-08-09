import { describe, it, expect } from "vitest";
import worker, { type Env } from "../src/worker";
import { MemoryStore } from "./helpers";

function makeEnv(overrides: Partial<Env> = {}): Env {
  return {
    AUTH314_KV: new MemoryStore() as unknown as KVNamespace,
    AUTH_SECRET: "secret",
    PI_CLIENT_ID: "client-id",
    ...overrides,
  };
}

const req = () => new Request("https://api.example/health");

describe("configuration guard", () => {
  it("serves normally when fully configured", async () => {
    const res = await worker.fetch(req(), makeEnv());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
  });

  it("names a missing AUTH_SECRET instead of failing silently", async () => {
    const res = await worker.fetch(req(), makeEnv({ AUTH_SECRET: "" }));
    expect(res.status).toBe(500);
    const body = (await res.json()) as { missing: string[] };
    expect(body.missing).toEqual(["AUTH_SECRET"]);
  });

  it("names a missing PI_CLIENT_ID", async () => {
    const res = await worker.fetch(req(), makeEnv({ PI_CLIENT_ID: "" }));
    const body = (await res.json()) as { missing: string[] };
    expect(body.missing).toEqual(["PI_CLIENT_ID"]);
  });

  it("reports every missing value at once", async () => {
    const res = await worker.fetch(
      req(),
      makeEnv({ AUTH_SECRET: "", PI_CLIENT_ID: "", AUTH314_KV: undefined as never }),
    );
    const body = (await res.json()) as { missing: string[] };
    expect(body.missing).toEqual([
      "AUTH_SECRET",
      "PI_CLIENT_ID",
      "AUTH314_KV (KV namespace binding)",
    ]);
  });
});
