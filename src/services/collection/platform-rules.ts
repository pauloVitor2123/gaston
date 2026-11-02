import type { Platform } from "@/db/schema";

export type PlatformMatch =
  | { kind: "existing"; platform: Platform }
  | { kind: "new"; name: string }
  | { kind: "none" };

export function canonicalizePlatform(proposedName: string | undefined, platforms: Platform[]): PlatformMatch {
  const trimmed = proposedName?.trim();
  if (!trimmed) return { kind: "none" };
  const normalized = trimmed.toLowerCase();
  const existing = platforms.find(
    (p) => p.name.toLowerCase() === normalized || p.synonyms.some((s) => s.toLowerCase() === normalized),
  );
  return existing ? { kind: "existing", platform: existing } : { kind: "new", name: trimmed };
}
