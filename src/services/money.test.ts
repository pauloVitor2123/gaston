import { describe, expect, it } from "vitest";
import { formatReais, parseBRLToCents } from "@/services/money";

describe("formatReais", () => {
  it("formats cents as Brazilian reais", () => {
    expect(formatReais(45000)).toBe("R$ 450,00");
    expect(formatReais(0)).toBe("R$ 0,00");
  });
});

describe("parseBRLToCents", () => {
  it("parses a plain integer", () => {
    expect(parseBRLToCents("5000")).toBe(500000);
  });

  it("parses a comma decimal", () => {
    expect(parseBRLToCents("5000,50")).toBe(500050);
  });

  it("parses a dot decimal", () => {
    expect(parseBRLToCents("5000.50")).toBe(500050);
  });

  it("treats dot as a thousands separator when it groups three digits", () => {
    expect(parseBRLToCents("5.000")).toBe(500000);
    expect(parseBRLToCents("1.500.000")).toBe(150000000);
  });

  it("parses the full Brazilian format with R$ and both separators", () => {
    expect(parseBRLToCents("R$ 5.000,50")).toBe(500050);
  });

  it("returns null for non-numeric or negative input", () => {
    expect(parseBRLToCents("abc")).toBeNull();
    expect(parseBRLToCents("")).toBeNull();
    expect(parseBRLToCents("-10")).toBeNull();
  });

  it("rejects values with more than two decimal places instead of rounding silently", () => {
    expect(parseBRLToCents("1.2345")).toBeNull();
    expect(parseBRLToCents("5000,505")).toBeNull();
  });
});
