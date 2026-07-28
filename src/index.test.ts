import { SELF } from "cloudflare:test";
import { describe, it, expect } from "vitest";

describe("worker fetch", () => {
  it("GET /health returns ok status", async () => {
    const res = await SELF.fetch("https://gaston.test/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: "ok", service: "gaston" });
  });

});
