import { describe, it, expect } from "vitest";
import { fallbackFor, CHEAP_FALLBACKS } from "./fallback";

describe("fallbackFor", () => {
  it("interpret mode signals low confidence so the client uses its own defaults", () => {
    const result = fallbackFor("interpret", {});
    expect(result).toEqual({ confidence: 0 });
  });

  it("suggest mode returns the matching category's cheap fallback", () => {
    const result = fallbackFor("suggest", { category: "dessert" }) as any;
    expect(result.name).toBe(CHEAP_FALLBACKS.dessert.name);
    expect(result.category).toBe("dessert");
  });

  it("suggest mode defaults to 'side' for an unknown or missing category", () => {
    const missing = fallbackFor("suggest", {}) as any;
    const unknown = fallbackFor("suggest", { category: "snacks" }) as any;
    expect(missing.category).toBe("side");
    expect(unknown.category).toBe("side");
  });

  it("resolve mode fails open — never blocks a claim just because the model is down", () => {
    const result = fallbackFor("resolve", {});
    expect(result).toEqual({ conflict: false });
  });

  it("tradeoff mode prefers whichever option has the lower estimated cost", () => {
    const cheaperB = fallbackFor("tradeoff", {
      optionA: { name: "Steak", estimatedCost: 30, servingSize: 4 },
      optionB: { name: "Pasta", estimatedCost: 12, servingSize: 6 },
    }) as any;
    expect(cheaperB.preferredOption).toBe("B");

    const cheaperA = fallbackFor("tradeoff", {
      optionA: { name: "Pasta", estimatedCost: 12, servingSize: 6 },
      optionB: { name: "Steak", estimatedCost: 30, servingSize: 4 },
    }) as any;
    expect(cheaperA.preferredOption).toBe("A");
  });
});
