import { describe, expect, it } from "vitest";
import { applyMantraRules } from "@/services/collection/mantra-rules";

describe("applyMantraRules", () => {
  it("returns 'Doar' for dízimo", () => {
    expect(applyMantraRules("paguei o dízimo da igreja")).toBe("Doar");
  });

  it("returns 'Doar' for doação", () => {
    expect(applyMantraRules("fiz uma doação para a instituição")).toBe("Doar");
  });

  it("returns 'Se Pagar' for TotalPass", () => {
    expect(applyMantraRules("mensalidade TotalPass")).toBe("Se Pagar");
  });

  it("returns 'Se Pagar' for academia", () => {
    expect(applyMantraRules("mensalidade academia SmartFit")).toBe("Se Pagar");
  });

  it("returns 'Se Pagar' for terapia", () => {
    expect(applyMantraRules("sessão de terapia")).toBe("Se Pagar");
  });

  it("returns 'Pagas as Contas' as default for unrecognized description", () => {
    expect(applyMantraRules("comprei pizza")).toBe("Pagas as Contas");
  });

  it("matching is case-insensitive", () => {
    expect(applyMantraRules("ACADEMIA fitness")).toBe("Se Pagar");
  });
});
