import { describe, expect, it } from "vitest";
import { FixedClock, SystemClock } from "@/services/clock";

const SAO_PAULO = "America/Sao_Paulo";

describe("FixedClock", () => {
  it("returns the injected instant from now()", () => {
    const instant = new Date("2026-08-06T02:30:00.000Z");
    expect(new FixedClock(instant).now()).toEqual(instant);
  });

  it("resolves 23:30 in São Paulo (02:30Z next day) back to the local civil date", () => {
    const clock = new FixedClock(new Date("2026-08-06T02:30:00.000Z"));
    expect(clock.today(SAO_PAULO)).toEqual(new Date(Date.UTC(2026, 7, 5)));
  });

  it("resolves 22:00Z into the next civil day for a positive-offset timezone", () => {
    const clock = new FixedClock(new Date("2026-08-05T22:00:00.000Z"));
    expect(clock.today("Asia/Tokyo")).toEqual(new Date(Date.UTC(2026, 7, 6)));
  });
});

describe("SystemClock", () => {
  it("derives today() from now()", () => {
    const clock = new SystemClock();
    const civil = clock.today(SAO_PAULO);
    expect(civil.getUTCHours()).toBe(0);
    expect(civil.getUTCMinutes()).toBe(0);
  });
});
