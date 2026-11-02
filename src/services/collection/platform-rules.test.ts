import { describe, expect, it } from "vitest";
import type { Platform } from "@/db/schema";
import { canonicalizePlatform } from "@/services/collection/platform-rules";

function platform(id: number, name: string, synonyms: string[] = []): Platform {
  return { id, userId: 1, name, synonyms };
}

const platforms: Platform[] = [
  platform(1, "Uber", ["uber"]),
  platform(2, "99", ["99", "99pop", "noventa e nove"]),
];

describe("canonicalizePlatform", () => {
  it("reuses a platform matched by name, case-insensitive and trimmed", () => {
    expect(canonicalizePlatform("  UBER ", platforms)).toEqual({ kind: "existing", platform: platforms[0] });
  });

  it("reuses a platform matched by synonym", () => {
    expect(canonicalizePlatform("99Pop", platforms)).toEqual({ kind: "existing", platform: platforms[1] });
  });

  it("proposes a new platform when nothing matches", () => {
    expect(canonicalizePlatform("InDrive", platforms)).toEqual({ kind: "new", name: "InDrive" });
  });

  it("returns none when no platform was proposed", () => {
    expect(canonicalizePlatform(undefined, platforms)).toEqual({ kind: "none" });
    expect(canonicalizePlatform("   ", platforms)).toEqual({ kind: "none" });
  });
});
