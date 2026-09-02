"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { totalClaimed, acceptanceRate, budgetSaved } from "@/lib/budget";

type Item = {
  id: string;
  name: string;
  category: string | null;
  estimated_cost: number | null;
  original_cost: number | null;
  status: "suggested" | "claimed" | "conflict";
};

export default function RecapPage() {
  const { id: eventId } = useParams<{ id: string }>();

  const [items, setItems] = useState<Item[]>([]);
  const [conflictCount, setConflictCount] = useState(0);
  const [maxBudget, setMaxBudget] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!eventId) return;
    (async () => {
      const [{ data: itemRows }, { count }, { data: eventRow }] = await Promise.all([
        supabase.from("items").select("*").eq("event_id", eventId),
        supabase
          .from("conflict_resolutions")
          .select("id", { count: "exact", head: true })
          .eq("event_id", eventId),
        supabase.from("events").select("max_budget").eq("id", eventId).single(),
      ]);
      setItems((itemRows as Item[]) ?? []);
      setConflictCount(count ?? 0);
      setMaxBudget(eventRow?.max_budget ?? null);
      setLoading(false);
    })();
  }, [eventId]);

  const spent = totalClaimed(items);
  const acceptance = acceptanceRate(items);
  const saved = budgetSaved(items);

  const byCategory = items.reduce<Record<string, number>>((acc, item) => {
    const cat = item.category ?? "uncategorized";
    acc[cat] = (acc[cat] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <main className="min-h-screen p-6 max-w-4xl mx-auto space-y-6">
      <header className="flex items-start justify-between">
        <h1 className="text-2xl font-semibold">Post-Event Recap</h1>
        <Link href={`/event/${eventId}`} className="text-sm underline text-neutral-400 hover:text-neutral-200">
          Back to event
        </Link>
      </header>

      {loading ? (
        <p className="text-neutral-500 text-sm">Loading…</p>
      ) : (
        <>
          <section className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
              <p className="text-xs text-neutral-500">Total spent vs. budget</p>
              <p className="text-xl font-semibold">
                ${spent}
                {maxBudget != null && <span className="text-neutral-500"> / ${maxBudget}</span>}
              </p>
            </div>
            <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
              <p className="text-xs text-neutral-500">Conflicts resolved</p>
              <p className="text-xl font-semibold">{conflictCount}</p>
            </div>
            <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
              <p className="text-xs text-neutral-500">Suggestion acceptance rate</p>
              <p className="text-xl font-semibold">
                {acceptance === null ? "—" : `${Math.round(acceptance)}%`}
              </p>
            </div>
            <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
              <p className="text-xs text-neutral-500">Budget saved via conflict resolution</p>
              <p className="text-xl font-semibold">{saved === null ? "—" : `$${saved}`}</p>
            </div>
          </section>

          <section className="space-y-2">
            <h2 className="text-sm font-medium text-neutral-400">Items by category</h2>
            {Object.keys(byCategory).length === 0 ? (
              <p className="text-sm text-neutral-500">No items yet.</p>
            ) : (
              <ul className="grid gap-2 sm:grid-cols-2">
                {Object.entries(byCategory).map(([cat, count]) => (
                  <li
                    key={cat}
                    className="rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-2 flex justify-between text-sm"
                  >
                    <span>{cat}</span>
                    <span className="text-neutral-500">{count}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </main>
  );
}
