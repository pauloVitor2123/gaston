import { SELF } from "cloudflare:test";
import { describe, it, expect } from "vitest";

describe("worker fetch", () => {
  it("GET /health retorna status ok", async () => {
    const res = await SELF.fetch("https://gaston.test/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: "ok", service: "gaston" });
  });

  it("GET / retorna texto de boas-vindas", async () => {
    const res = await SELF.fetch("https://gaston.test/");
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("Gaston");
  });
});
