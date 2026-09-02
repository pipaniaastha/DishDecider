export type Mode = "interpret" | "suggest" | "resolve" | "tradeoff";

export type TradeoffOption = { name: string; estimatedCost: number; servingSize: number };

export const CHEAP_FALLBACKS: Record<
  string,
  { name: string; estimatedCost: number; servingSize: number }
> = {
  appetizer: { name: "Chips & Salsa", estimatedCost: 6, servingSize: 6 },
  main: { name: "Baked Ziti", estimatedCost: 14, servingSize: 8 },
  side: { name: "Green Bean Casserole", estimatedCost: 8, servingSize: 6 },
  dessert: { name: "Store-Bought Brownies", estimatedCost: 7, servingSize: 8 },
  beverage: { name: "Sparkling Water (case)", estimatedCost: 5, servingSize: 10 },
};

export function fallbackFor(
  mode: Mode,
  payload: { category?: string; optionA?: TradeoffOption; optionB?: TradeoffOption }
) {
  switch (mode) {
    case "interpret":
      return { confidence: 0 };
    case "suggest": {
      const cat =
        payload.category && CHEAP_FALLBACKS[payload.category] ? payload.category : "side";
      const pick = CHEAP_FALLBACKS[cat];
      return {
        ...pick,
        category: cat,
        rationale: "Fallback suggestion (reasoning service unavailable).",
      };
    }
    case "resolve":
      return { conflict: false };
    case "tradeoff": {
      const { optionA, optionB } = payload;
      const preferredOption: "A" | "B" =
        optionA && optionB && optionB.estimatedCost < optionA.estimatedCost ? "B" : "A";
      return {
        preferredOption,
        rationale: "Fallback pick: lower estimated cost (reasoning service unavailable).",
      };
    }
  }
}
