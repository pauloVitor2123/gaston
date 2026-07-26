const MAX_LENGTH = 2000;

function buildStripPattern(): RegExp {
  const chars = [
    ...Array.from({ length: 9 }, (_, i) => String.fromCodePoint(i)),
    String.fromCodePoint(0x000b),
    String.fromCodePoint(0x000c),
    ...Array.from({ length: 18 }, (_, i) => String.fromCodePoint(0x000e + i)),
    String.fromCodePoint(0x007f),
    String.fromCodePoint(0x200b),
    String.fromCodePoint(0x200c),
    String.fromCodePoint(0x200d),
    String.fromCodePoint(0xfeff),
  ].join("");
  return new RegExp(`[${chars}]`, "g");
}

const STRIP_PATTERN = buildStripPattern();

export function sanitizeUserMessage(raw: string): string {
  return raw.replace(STRIP_PATTERN, "").slice(0, MAX_LENGTH);
}
