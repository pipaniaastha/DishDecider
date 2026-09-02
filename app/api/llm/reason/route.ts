import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { fallbackFor, type Mode } from "@/lib/fallback";

// One endpoint, three modes. Keeps prompt/validation/fallback logic in one
// place instead of duplicating it across /api/llm/interpret, /suggest, /resolve.
// Fallback data lives in lib/fallback.ts so it's covered by unit tests
// independent of the network call in this route.

const MODES = ["interpret", "suggest", "resolve", "tradeoff"] as const;

// ---- Prompt builders -----------------------------------------------------------

function buildPrompt(mode: Mode, payload: any): { system: string; user: string } {
  if (mode === "interpret") {
    return {
      system:
        "You convert a party guest's casual message into structured planning " +
        "constraints. Respond with JSON only, matching this shape: " +
        '{"maxBudget"?: number, "category"?: "appetizer"|"main"|"side"|"dessert"|"beverage", ' +
        '"dietaryNeeds"?: string[], "confidence": number between 0 and 1}. ' +
        'Example: "I\'m broke this week" -> {"maxBudget": 10, "confidence": 0.8}. ' +
        'Example: "want to impress but only have 20 min" -> {"category": "appetizer", "confidence": 0.75}.',
      user: JSON.stringify({ text: payload.text }),
    };
  }
  if (mode === "suggest") {
    return {
      system:
        "You recommend one specific potluck dish given constraints and the " +
        "list of items already claimed. Never repeat an existing item or " +
        "close variant of one. Respond with JSON only: " +
        '{"name": string, "category": string, "estimatedCost": number, ' +
        '"servingSize": number, "rationale": string (one sentence)}.',
      user: JSON.stringify({
        maxBudget: payload.maxBudget,
        category: payload.category,
        dietaryNeeds: payload.dietaryNeeds,
        existingItems: payload.existingItems,
      }),
    };
  }
  if (mode === "resolve") {
    return {
      system:
        "You check a proposed potluck item against the existing list and " +
        "participants' dietary restrictions. Flag it if it's a semantic " +
        "duplicate of an existing item (same food category, e.g. two pastas), " +
        "conflicts with someone's dietary restriction, or would push the group " +
        "over budget. Respond with JSON only: " +
        '{"conflict": boolean, "type"?: "duplicate"|"dietary"|"budget"|"balance", ' +
        '"rationale"?: string, "alternative"?: {"name": string, "estimatedCost"?: number}}.',
      user: JSON.stringify({
        proposedItemName: payload.proposedItemName,
        proposedCategory: payload.proposedCategory,
        proposedCost: payload.proposedCost,
        existingItems: payload.existingItems,
        participants: payload.participants,
      }),
    };
  }
  // tradeoff
  return {
    system:
      "You compare two potluck item options and pick the better one, given " +
      "cost and serving size. Respond with JSON only: " +
      '{"preferredOption": "A"|"B", "rationale": string (one sentence)}.',
    user: JSON.stringify({
      optionA: payload.optionA,
      optionB: payload.optionB,
    }),
  };
}

async function callModel(system: string, user: string): Promise<unknown> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("GROQ_API_KEY not configured");

  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "openai/gpt-oss-20b",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature: 0.4,
    }),
  });

  if (!res.ok) throw new Error(`Groq call failed: ${res.status}`);
  const data = await res.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("Empty model response");
  return JSON.parse(content);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const mode: Mode = body.mode;

  if (!MODES.includes(mode)) {
    return NextResponse.json({ error: "invalid mode" }, { status: 400 });
  }

  const { system, user } = buildPrompt(mode, body);

  try {
    const raw = await callModel(system, user);
    return NextResponse.json(raw);
  } catch (err) {
    // Deterministic fallback keeps the demo alive even if the LLM call
    // fails or returns something Zod on the client will reject.
    console.error(`[reason:${mode}] falling back:`, err);
    return NextResponse.json(fallbackFor(mode, body));
  }
}
