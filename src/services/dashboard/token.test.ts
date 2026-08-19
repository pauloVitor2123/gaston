import { describe, it, expect } from "vitest";
import { FixedClock } from "@/services/clock";
import { DashboardLink, signToken, verifyToken } from "@/services/dashboard/token";

const SECRET = "unit-secret";
const NOW = new Date("2026-08-18T12:00:00Z");
const DAY_MS = 24 * 60 * 60 * 1000;

describe("dashboard token", () => {
  it("verifies a fresh token for the same user", async () => {
    const token = await signToken(7, SECRET, NOW);
    expect(await verifyToken(7, token, SECRET, NOW)).toBe(true);
  });

  it("rejects a token verified for a different user", async () => {
    const token = await signToken(7, SECRET, NOW);
    expect(await verifyToken(8, token, SECRET, NOW)).toBe(false);
  });

  it("rejects a token signed with a different secret", async () => {
    const token = await signToken(7, SECRET, NOW);
    expect(await verifyToken(7, token, "other-secret", NOW)).toBe(false);
  });

  it("accepts the token right up to its expiry and rejects it after", async () => {
    const token = await signToken(7, SECRET, NOW);
    const justBefore = new Date(NOW.getTime() + DAY_MS - 1);
    const atExpiry = new Date(NOW.getTime() + DAY_MS);
    expect(await verifyToken(7, token, SECRET, justBefore)).toBe(true);
    expect(await verifyToken(7, token, SECRET, atExpiry)).toBe(false);
  });

  it("rejects a tampered expiry", async () => {
    const token = await signToken(7, SECRET, NOW);
    const [, signature] = token.split(".");
    const forged = `${NOW.getTime() + 10 * DAY_MS}.${signature}`;
    expect(await verifyToken(7, forged, SECRET, NOW)).toBe(false);
  });

  it("rejects malformed tokens", async () => {
    expect(await verifyToken(7, "nope", SECRET, NOW)).toBe(false);
    expect(await verifyToken(7, "", SECRET, NOW)).toBe(false);
    expect(await verifyToken(7, ".abc", SECRET, NOW)).toBe(false);
  });

  it("builds a dashboard URL carrying a verifiable token", async () => {
    const link = new DashboardLink(SECRET, new FixedClock(NOW));
    const url = await link.build("https://gaston.test", 7);
    const params = new URL(url).searchParams;
    expect(params.get("u")).toBe("7");
    expect(await verifyToken(7, params.get("t")!, SECRET, NOW)).toBe(true);
  });
});
