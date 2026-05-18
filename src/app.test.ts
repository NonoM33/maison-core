import { describe, expect, it } from "bun:test";
import { createApp } from "./app.ts";

describe("createApp", () => {
  it("returns 200 with status ok on GET /health", async () => {
    const app = createApp();

    const res = await app.request("/health");

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
  });

  it("returns 404 on unknown route", async () => {
    const app = createApp();

    const res = await app.request("/does-not-exist");

    expect(res.status).toBe(404);
  });
});
