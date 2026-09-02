"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { registerAllTools } from "@/app/webmcp/tools";
import { isWebMCPSupported } from "@/app/webmcp/types";
import { totalClaimed, remainingBudget } from "@/lib/budget";

const BUDGET_WARNING_THRESHOLD = 0.8;

type Item = {
  id: string;
  name: string;
  category: string | null;
  estimated_cost: number | null;
  original_cost: number | null;
  serving_size: number | null;
  agent_suggestion_rationale: string | null;
  status: "suggested" | "claimed" | "conflict";
  claimed_by: string | null;
};

type ConflictLogEntry = {
  id: string;
  rationale: string;
  resolution_type: string;
  alternative_item: string | null;
  resolved_at: string;
};

type TradeoffOption = { name: string; estimatedCost: number; servingSize: number };

const DIETARY_OPTIONS = ["vegetarian", "vegan", "gluten-free", "dairy-free", "nut-free"];

export default function EventPage() {
  const { id: eventId } = useParams<{ id: string }>();

  const [joined, setJoined] = useState(false);
  const [participantId, setParticipantId] = useState<string | null>(null);
  const [participantName, setParticipantName] = useState("");
  const [dietary, setDietary] = useState<string[]>([]);

  const [items, setItems] = useState<Item[]>([]);
  const [log, setLog] = useState<ConflictLogEntry[]>([]);
  const [maxBudget, setMaxBudget] = useState<number | null>(null);
  const budgetFlagged = useRef(false);
  const [agentInput, setAgentInput] = useState("");
  const [agentBusy, setAgentBusy] = useState(false);
  const [webmcpOk, setWebmcpOk] = useState(true);

  // Tradeoff context/answers are keyed by conflict_resolutions row id and only
  // populated for conflicts resolved in this session (the row itself doesn't
  // persist option costs, so a "Why?" button can't be reconstructed after reload).
  const [tradeoffContext, setTradeoffContext] = useState<Record<string, { optionA: TradeoffOption; optionB: TradeoffOption }>>({});
  const [tradeoffAnswers, setTradeoffAnswers] = useState<Record<string, string>>({});
  const [tradeoffLoading, setTradeoffLoading] = useState<string | null>(null);

  // Register WebMCP tools once, and check flag support.
  useEffect(() => {
    registerAllTools();
    setWebmcpOk(isWebMCPSupported());
  }, []);

  const loadState = useCallback(async () => {
    if (!eventId) return;
    const { data: itemRows } = await supabase
      .from("items")
      .select("*")
      .eq("event_id", eventId)
      .order("created_at", { ascending: true });
    setItems((itemRows as Item[]) ?? []);

    const { data: logRows } = await supabase
      .from("conflict_resolutions")
      .select("*")
      .eq("event_id", eventId)
      .order("resolved_at", { ascending: false })
      .limit(20);
    setLog((logRows as ConflictLogEntry[]) ?? []);
  }, [eventId]);

  useEffect(() => {
    loadState();
    if (!eventId) return;
    supabase
      .from("events")
      .select("max_budget")
      .eq("id", eventId)
      .single()
      .then(({ data }) => setMaxBudget(data?.max_budget ?? null));
    const channel = supabase
      .channel(`event-${eventId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "items", filter: `event_id=eq.${eventId}` }, loadState)
      .on("postgres_changes", { event: "*", schema: "public", table: "conflict_resolutions", filter: `event_id=eq.${eventId}` }, loadState)
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [eventId, loadState]);

  // Passive budget flag: once claimed spend crosses 80% of the event cap,
  // drop a single conflict_resolutions row warning the group — guarded by a
  // ref so re-renders (and repeated realtime updates) don't spam the log.
  useEffect(() => {
    if (budgetFlagged.current || maxBudget == null || items.length === 0) return;
    const claimed = totalClaimed(items);
    if (claimed / maxBudget < BUDGET_WARNING_THRESHOLD) return;

    budgetFlagged.current = true;
    const pct = Math.round((claimed / maxBudget) * 100);
    const remaining = Math.max(remainingBudget(items, maxBudget), 0);
    supabase.from("conflict_resolutions").insert({
      event_id: eventId,
      resolution_type: "budget",
      rationale: `Group is at ${pct}% of budget — remaining items should stay under $${remaining}`,
    });
  }, [items, maxBudget, eventId]);

  async function joinEvent() {
    if (!participantName.trim()) return;
    const { data, error } = await supabase
      .from("participants")
      .insert({ event_id: eventId, name: participantName, dietary_restrictions: dietary })
      .select()
      .single();
    if (!error && data) {
      setParticipantId(data.id);
      setJoined(true);
    }
  }

  // Agent Command Center: free-text -> interpret_intent -> suggest_item -> claim.
  // (Calls the same reasoning route the WebMCP tools use, so an external
  // agent driving this page via document.modelContext.registerTool exercises
  // identical logic to a human typing here directly.)
  async function handleAgentRequest() {
    if (!agentInput.trim()) return;
    setAgentBusy(true);
    try {
      const interpretRes = await fetch("/api/llm/reason", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "interpret", text: agentInput, eventId }),
      }).then((r) => r.json());

      const suggestRes = await fetch("/api/llm/reason", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "suggest",
          eventId,
          maxBudget: interpretRes.maxBudget,
          category: interpretRes.category,
          dietaryNeeds: interpretRes.dietaryNeeds ?? dietary,
          existingItems: items.map((i) => ({ name: i.name, category: i.category })),
        }),
      }).then((r) => r.json());

      // Silent conflict check before we claim it — same background check
      // that runs on manual claims, so the agent is always "on."
      const conflictRes = await fetch("/api/llm/reason", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "resolve",
          eventId,
          proposedItemName: suggestRes.name,
          proposedCategory: suggestRes.category,
          proposedCost: suggestRes.estimatedCost,
          existingItems: items.map((i) => ({ name: i.name, category: i.category, estimated_cost: i.estimated_cost })),
          participants: [],
        }),
      }).then((r) => r.json());

      const finalItem = conflictRes.conflict && conflictRes.alternative
        ? { name: conflictRes.alternative.name, category: suggestRes.category, estimatedCost: conflictRes.alternative.estimatedCost ?? suggestRes.estimatedCost }
        : { name: suggestRes.name, category: suggestRes.category, estimatedCost: suggestRes.estimatedCost };

      // Track the pre-swap cost only when resolve_conflict actually swapped in a
      // cheaper alternative — powers the recap's "budget saved" metric.
      const wasCheaperSwap =
        conflictRes.conflict &&
        conflictRes.alternative &&
        typeof conflictRes.alternative.estimatedCost === "number" &&
        conflictRes.alternative.estimatedCost < suggestRes.estimatedCost;

      await supabase.from("items").insert({
        event_id: eventId,
        claimed_by: participantId,
        name: finalItem.name,
        category: finalItem.category,
        estimated_cost: finalItem.estimatedCost,
        original_cost: wasCheaperSwap ? suggestRes.estimatedCost : null,
        serving_size: suggestRes.servingSize,
        agent_suggestion_rationale: conflictRes.conflict
          ? `${suggestRes.rationale} — adjusted: ${conflictRes.rationale}`
          : suggestRes.rationale,
        status: conflictRes.conflict ? "conflict" : "claimed",
      });

      if (conflictRes.conflict) {
        const { data: conflictRow } = await supabase
          .from("conflict_resolutions")
          .insert({
            event_id: eventId,
            resolution_type: conflictRes.type ?? "duplicate",
            rationale: conflictRes.rationale ?? "",
            alternative_item: conflictRes.alternative?.name ?? null,
            resolved_by: participantId,
          })
          .select()
          .single();

        if (conflictRow && conflictRes.alternative) {
          setTradeoffContext((ctx) => ({
            ...ctx,
            [conflictRow.id]: {
              optionA: { name: suggestRes.name, estimatedCost: suggestRes.estimatedCost, servingSize: suggestRes.servingSize },
              optionB: {
                name: conflictRes.alternative.name,
                estimatedCost: conflictRes.alternative.estimatedCost ?? suggestRes.estimatedCost,
                servingSize: suggestRes.servingSize,
              },
            },
          }));
        }
      }

      setAgentInput("");
    } finally {
      setAgentBusy(false);
    }
  }

  async function explainTradeoff(entryId: string) {
    const ctx = tradeoffContext[entryId];
    if (!ctx || tradeoffAnswers[entryId]) return;
    setTradeoffLoading(entryId);
    try {
      const res = await fetch("/api/llm/reason", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "tradeoff", eventId, optionA: ctx.optionA, optionB: ctx.optionB }),
      }).then((r) => r.json());
      setTradeoffAnswers((a) => ({ ...a, [entryId]: res.rationale }));
    } finally {
      setTradeoffLoading(null);
    }
  }

  if (!joined) {
    return (
      <main className="min-h-screen flex items-center justify-center p-6">
        <div className="max-w-sm w-full space-y-4">
          <h1 className="text-2xl font-semibold">Join this event</h1>
          <input
            className="w-full rounded-lg bg-neutral-900 border border-neutral-700 px-4 py-2 outline-none"
            placeholder="Your name"
            value={participantName}
            onChange={(e) => setParticipantName(e.target.value)}
          />
          <div className="flex flex-wrap gap-2">
            {DIETARY_OPTIONS.map((opt) => (
              <button
                key={opt}
                onClick={() =>
                  setDietary((d) => (d.includes(opt) ? d.filter((x) => x !== opt) : [...d, opt]))
                }
                className={`px-3 py-1 rounded-full text-sm border ${
                  dietary.includes(opt) ? "bg-white text-black border-white" : "border-neutral-700 text-neutral-300"
                }`}
              >
                {opt}
              </button>
            ))}
          </div>
          <button onClick={joinEvent} className="w-full rounded-lg bg-white text-black font-medium py-2">
            Join
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen p-6 max-w-4xl mx-auto space-y-6">
      {!webmcpOk && (
        <div className="rounded-lg border border-yellow-700 bg-yellow-950/40 px-4 py-2 text-sm text-yellow-300">
          Your browser doesn&apos;t expose WebMCP yet. Enable it at{" "}
          <code className="font-mono">chrome://flags/#enable-webmcp-testing</code>, or open this page
          in ChatGPT&apos;s in-app browser, to let an agent use these tools directly.
        </div>
      )}

      <header className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Event Dashboard</h1>
          <p className="text-neutral-400 text-sm">Joined as {participantName}</p>
        </div>
        <Link href={`/event/${eventId}/recap`} className="text-sm underline text-neutral-400 hover:text-neutral-200">
          View Recap
        </Link>
      </header>

      {/* Agent Command Center */}
      <section className="space-y-2">
        <label className="text-sm text-neutral-400">
          Tell your agent what to bring, or ask for help:
        </label>
        <div className="flex gap-2">
          <input
            className="flex-1 rounded-lg bg-neutral-900 border border-neutral-700 px-4 py-2 outline-none"
            placeholder="e.g. I'm broke this week, or I want to impress but only have 20 minutes"
            value={agentInput}
            onChange={(e) => setAgentInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAgentRequest()}
          />
          <button
            onClick={handleAgentRequest}
            disabled={agentBusy}
            className="rounded-lg bg-white text-black font-medium px-4 disabled:opacity-50"
          >
            {agentBusy ? "Agent is thinking…" : "Ask agent"}
          </button>
        </div>
      </section>

      {/* Living List */}
      <section className="grid gap-3 sm:grid-cols-2">
        {items.map((item) => (
          <div key={item.id} className="rounded-lg border border-neutral-800 bg-neutral-900 p-4 space-y-1">
            <div className="flex justify-between items-start">
              <span className="font-medium">{item.name}</span>
              <span
                className={`text-xs rounded-full px-2 py-0.5 ${
                  item.status === "conflict"
                    ? "bg-red-950 text-red-300"
                    : item.status === "claimed"
                    ? "bg-green-950 text-green-300"
                    : "bg-neutral-800 text-neutral-300"
                }`}
              >
                {item.status}
              </span>
            </div>
            <p className="text-xs text-neutral-500">
              {item.category ?? "uncategorized"} · ${item.estimated_cost ?? "?"} · serves{" "}
              {item.serving_size ?? "?"}
            </p>
            {item.agent_suggestion_rationale && (
              <p className="text-xs text-neutral-400 italic">🧠 {item.agent_suggestion_rationale}</p>
            )}
          </div>
        ))}
        {items.length === 0 && (
          <p className="text-neutral-500 text-sm col-span-2">No items yet — ask your agent to suggest one.</p>
        )}
      </section>

      {/* Conflict Log */}
      <section className="space-y-2">
        <h2 className="text-sm font-medium text-neutral-400">Agent activity log</h2>
        <div className="space-y-1 max-h-56 overflow-y-auto">
          {log.map((entry) => (
            <div key={entry.id} className="text-xs text-neutral-400">
              <p>
                🧠 [{entry.resolution_type}] {entry.rationale}
                {entry.alternative_item && ` — suggested "${entry.alternative_item}" instead`}
                {entry.alternative_item && tradeoffContext[entry.id] && !tradeoffAnswers[entry.id] && (
                  <button
                    onClick={() => explainTradeoff(entry.id)}
                    disabled={tradeoffLoading === entry.id}
                    className="ml-2 underline text-neutral-500 hover:text-neutral-300 disabled:opacity-50"
                  >
                    {tradeoffLoading === entry.id ? "thinking…" : "Why?"}
                  </button>
                )}
              </p>
              {tradeoffAnswers[entry.id] && (
                <p className="pl-4 italic text-neutral-500">↳ {tradeoffAnswers[entry.id]}</p>
              )}
            </div>
          ))}
          {log.length === 0 && <p className="text-xs text-neutral-600">No conflicts resolved yet.</p>}
        </div>
      </section>
    </main>
  );
}
