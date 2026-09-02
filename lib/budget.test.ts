import { describe, it, expect } from "vitest";
import { totalClaimed, remainingBudget, isOverBudget, acceptanceRate, budgetSaved } from "./budget";

describe("budget math", () => {
  const items = [{ estimated_cost: 10 }, { estimated_cost: 8 }, { estimated_cost: null }];

  it("sums claimed costs, treating null as 0", () => {
    expect(totalClaimed(items)).toBe(18);
  });

  it("computes remaining headroom against a cap", () => {
    expect(remainingBudget(items, 30)).toBe(12);
  });

  it("flags over-budget once the cap is exceeded", () => {
    expect(isOverBudget(items, 30)).toBe(false);
    expect(isOverBudget(items, 15)).toBe(true);
  });
});

describe("acceptanceRate", () => {
  it("returns null for an empty event instead of NaN", () => {
    expect(acceptanceRate([])).toBeNull();
  });

  it("excludes conflict items from both sides of the ratio", () => {
    const items = [
      { status: "claimed" },
      { status: "claimed" },
      { status: "suggested" },
      { status: "conflict" },
    ];
    expect(acceptanceRate(items)).toBe((2 / 3) * 100);
  });

  it("is 100% when every suggested/claimed item was claimed", () => {
    expect(acceptanceRate([{ status: "claimed" }, { status: "claimed" }])).toBe(100);
  });
});

describe("budgetSaved", () => {
  it("returns null when no item has a qualifying original_cost", () => {
    expect(budgetSaved([])).toBeNull();
    expect(budgetSaved([{ original_cost: null, estimated_cost: 10 }])).toBeNull();
    expect(budgetSaved([{ original_cost: 10, estimated_cost: 10 }])).toBeNull();
  });

  it("sums savings only across items swapped for something cheaper", () => {
    const items = [
      { original_cost: 30, estimated_cost: 12 },
      { original_cost: null, estimated_cost: 8 },
      { original_cost: 10, estimated_cost: 10 },
    ];
    expect(budgetSaved(items)).toBe(18);
  });
});
