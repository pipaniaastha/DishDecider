export type BudgetedItem = { estimated_cost: number | null };

/** Sum of claimed item costs, treating nulls as 0. */
export function totalClaimed(items: BudgetedItem[]): number {
  return items.reduce((sum, item) => sum + (item.estimated_cost ?? 0), 0);
}

/** Remaining budget headroom; never negative-looking in a way that confuses the UI. */
export function remainingBudget(items: BudgetedItem[], cap: number): number {
  return cap - totalClaimed(items);
}

export function isOverBudget(items: BudgetedItem[], cap: number): boolean {
  return totalClaimed(items) > cap;
}

export type StatusedItem = { status: string };

/**
 * % of suggested/claimed items that were claimed without needing a conflict
 * resolution. Items with status "conflict" are excluded from both sides of
 * the ratio. Returns null (not NaN) when there's no suggested/claimed data yet.
 */
export function acceptanceRate(items: StatusedItem[]): number | null {
  const relevant = items.filter((i) => i.status === "claimed" || i.status === "suggested");
  if (relevant.length === 0) return null;
  const claimed = relevant.filter((i) => i.status === "claimed").length;
  return (claimed / relevant.length) * 100;
}

export type SwappedItem = { original_cost: number | null; estimated_cost: number | null };

/**
 * Sum of (original_cost - estimated_cost) across items where a cheaper
 * alternative was swapped in during conflict resolution. Returns null
 * (not 0 or NaN) when no item qualifies.
 */
export function budgetSaved(items: SwappedItem[]): number | null {
  const savings = items
    .filter(
      (i): i is { original_cost: number; estimated_cost: number } =>
        i.original_cost != null && i.estimated_cost != null && i.original_cost > i.estimated_cost
    )
    .map((i) => i.original_cost - i.estimated_cost);
  if (savings.length === 0) return null;
  return savings.reduce((sum, v) => sum + v, 0);
}
