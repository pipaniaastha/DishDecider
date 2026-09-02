import { z } from "zod";
import { supabase } from "@/lib/supabase";
import "./types";

// ---- Shared response schemas -------------------------------------------------

const interpretSchema = z.object({
  maxBudget: z.number().optional(),
  category: z
    .enum(["appetizer", "main", "side", "dessert", "beverage"])
    .optional(),
  dietaryNeeds: z.array(z.string()).optional(),
  confidence: z.number().min(0).max(1),
});

const suggestSchema = z.object({
  name: z.string(),
  category: z.string(),
  estimatedCost: z.number(),
  servingSize: z.number(),
  rationale: z.string(),
});

const conflictSchema = z.object({
  conflict: z.boolean(),
  type: z.enum(["duplicate", "dietary", "budget", "balance"]).optional(),
  rationale: z.string().optional(),
  alternative: z
    .object({ name: z.string(), estimatedCost: z.number().optional() })
    .optional(),
});

const tradeoffOptionSchema = z.object({
  name: z.string(),
  estimatedCost: z.number(),
  servingSize: z.number(),
});

const tradeoffSchema = z.object({
  preferredOption: z.enum(["A", "B"]),
  rationale: z.string(),
});

// Small helper: every tool call goes through one API route, distinguished
// by `mode`, so prompt logic and fallback logic live in one place server-side.
async function callReasoner(mode: string, payload: Record<string, unknown>) {
  const res = await fetch("/api/llm/reason", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode, ...payload }),
  });
  if (!res.ok) {
    throw new Error(`Reasoning API failed with status ${res.status}`);
  }
  return res.json();
}

// ---- Tool 1: interpret_intent -------------------------------------------------
// Parses vague, open-ended human text into structured event constraints.
// Pure parser: it never recommends anything, only extracts structure.

export function registerInterpretIntent() {
  document.modelContext?.registerTool({
    name: "interpret_intent",
    description:
      "Parse an open-ended human request (e.g. 'I'm broke this week', " +
      "'I want to bring something impressive but only have 20 minutes') " +
      "into structured event constraints: budget, category, dietary needs.",
    inputSchema: {
      type: "object",
      properties: {
        text: { type: "string", description: "The participant's raw request" },
        eventId: { type: "string", description: "UUID of the event" },
      },
      required: ["text", "eventId"],
    },
    execute: async ({ text, eventId }: { text: string; eventId: string }) => {
      const raw = await callReasoner("interpret", { text, eventId });
      return interpretSchema.parse(raw);
    },
  });
}

// ---- Tool 2: suggest_item -----------------------------------------------------
// Recommends a specific dish given structured constraints + current list state.
// Pure generator: it never validates against conflicts, only proposes.

export function registerSuggestItem() {
  document.modelContext?.registerTool({
    name: "suggest_item",
    description:
      "Recommend a specific dish/item to bring, given budget, category, and " +
      "dietary constraints, while avoiding items already on the shared list.",
    inputSchema: {
      type: "object",
      properties: {
        eventId: { type: "string" },
        maxBudget: { type: "number" },
        category: { type: "string" },
        dietaryNeeds: { type: "array", items: { type: "string" } },
      },
      required: ["eventId"],
    },
    execute: async (input: {
      eventId: string;
      maxBudget?: number;
      category?: string;
      dietaryNeeds?: string[];
    }) => {
      const { data: existingItems } = await supabase
        .from("items")
        .select("name, category")
        .eq("event_id", input.eventId);

      const raw = await callReasoner("suggest", {
        ...input,
        existingItems: existingItems ?? [],
      });
      return suggestSchema.parse(raw);
    },
  });
}

// ---- Tool 3: resolve_conflict --------------------------------------------------
// Validates a proposed item against the full live event state and returns
// a resolution. Pure validator: it never generates from scratch.

export function registerResolveConflict() {
  document.modelContext?.registerTool({
    name: "resolve_conflict",
    description:
      "Check a proposed item against the full event state (existing items, " +
      "participant dietary needs, remaining budget) and return a conflict " +
      "resolution with a plain-language rationale and an alternative if needed.",
    inputSchema: {
      type: "object",
      properties: {
        eventId: { type: "string" },
        proposedItemName: { type: "string" },
        proposedCategory: { type: "string" },
        proposedCost: { type: "number" },
        participantId: { type: "string" },
      },
      required: ["eventId", "proposedItemName"],
    },
    execute: async (input: {
      eventId: string;
      proposedItemName: string;
      proposedCategory?: string;
      proposedCost?: number;
      participantId?: string;
    }) => {
      const [{ data: items }, { data: participants }] = await Promise.all([
        supabase
          .from("items")
          .select("id, name, category, estimated_cost")
          .eq("event_id", input.eventId),
        supabase
          .from("participants")
          .select("id, dietary_restrictions")
          .eq("event_id", input.eventId),
      ]);

      const raw = await callReasoner("resolve", {
        ...input,
        existingItems: items ?? [],
        participants: participants ?? [],
      });

      const parsed = conflictSchema.parse(raw);

      if (parsed.conflict) {
        await supabase.from("conflict_resolutions").insert({
          event_id: input.eventId,
          resolution_type: parsed.type ?? "duplicate",
          rationale: parsed.rationale ?? "",
          alternative_item: parsed.alternative?.name ?? null,
          resolved_by: input.participantId ?? null,
        });
      }

      return parsed;
    },
  });
}

// ---- Tool 4: explain_tradeoff --------------------------------------------------
// Compares two concrete options (e.g. a proposed item vs. a conflict-resolution
// alternative) and explains which is preferable. Pure explainer: it never
// mutates event state.

export function registerExplainTradeoff() {
  document.modelContext?.registerTool({
    name: "explain_tradeoff",
    description:
      "Compare two specific item options (name, estimated cost, serving size) " +
      "and explain in one sentence which is the better choice and why.",
    inputSchema: {
      type: "object",
      properties: {
        eventId: { type: "string" },
        optionA: {
          type: "object",
          properties: {
            name: { type: "string" },
            estimatedCost: { type: "number" },
            servingSize: { type: "number" },
          },
          required: ["name", "estimatedCost", "servingSize"],
        },
        optionB: {
          type: "object",
          properties: {
            name: { type: "string" },
            estimatedCost: { type: "number" },
            servingSize: { type: "number" },
          },
          required: ["name", "estimatedCost", "servingSize"],
        },
      },
      required: ["eventId", "optionA", "optionB"],
    },
    execute: async (input: {
      eventId: string;
      optionA: z.infer<typeof tradeoffOptionSchema>;
      optionB: z.infer<typeof tradeoffOptionSchema>;
    }) => {
      const raw = await callReasoner("tradeoff", {
        eventId: input.eventId,
        optionA: tradeoffOptionSchema.parse(input.optionA),
        optionB: tradeoffOptionSchema.parse(input.optionB),
      });
      return tradeoffSchema.parse(raw);
    },
  });
}

export function registerAllTools() {
  if (typeof document === "undefined" || !document.modelContext) return;
  registerInterpretIntent();
  registerSuggestItem();
  registerResolveConflict();
  registerExplainTradeoff();
}
