import { describe, expect, it } from "vitest";
import { sanitizeUserMessage } from "@/services/collection/sanitize";

const zwsp = String.fromCharCode(0x200b);
const zwnj = String.fromCharCode(0x200c);
const zwj = String.fromCharCode(0x200d);
const bom = String.fromCharCode(0xfeff);
const nul = String.fromCharCode(0x0000);
const ctrl1 = String.fromCharCode(0x0001);
const vtab = String.fromCharCode(0x000b);
const ff = String.fromCharCode(0x000c);

describe("sanitizeUserMessage", () => {
  it("passes through clean text unchanged", () => {
    expect(sanitizeUserMessage("comprei pizza por 45 reais")).toBe("comprei pizza por 45 reais");
  });

  it("preserves newlines and tabs", () => {
    expect(sanitizeUserMessage("linha 1\nlinha 2\tindentado")).toBe("linha 1\nlinha 2\tindentado");
  });

  it("removes zero-width space (U+200B)", () => {
    expect(sanitizeUserMessage(`ignore${zwsp}instrucoes`)).toBe("ignoreinstrucoes");
  });

  it("removes zero-width non-joiner (U+200C)", () => {
    expect(sanitizeUserMessage(`texto${zwnj}normal`)).toBe("textonormal");
  });

  it("removes zero-width joiner (U+200D)", () => {
    expect(sanitizeUserMessage(`texto${zwj}normal`)).toBe("textonormal");
  });

  it("removes BOM / zero-width no-break space (U+FEFF)", () => {
    expect(sanitizeUserMessage(`${bom}mensagem`)).toBe("mensagem");
  });

  it("removes null bytes (U+0000)", () => {
    expect(sanitizeUserMessage(`texto${nul}null`)).toBe("textonull");
  });

  it("removes control characters U+0001-U+0008", () => {
    expect(sanitizeUserMessage(`ab${ctrl1}c`)).toBe("abc");
  });

  it("removes vertical tab (U+000B) and form feed (U+000C)", () => {
    expect(sanitizeUserMessage(`ab${vtab}${ff}c`)).toBe("abc");
  });

  it("truncates to 2000 characters", () => {
    const long = "a".repeat(3000);
    expect(sanitizeUserMessage(long)).toHaveLength(2000);
  });

  it("truncation happens after stripping", () => {
    const withZeroWidth = `a${zwsp}`.repeat(1500);
    const result = sanitizeUserMessage(withZeroWidth);
    expect(result).toHaveLength(1500);
  });
});
