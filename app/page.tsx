"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

function generateShareCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

export default function HomePage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [maxBudget, setMaxBudget] = useState(20);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function createEvent() {
    if (!name.trim()) {
      setError("Give your event a name.");
      return;
    }
    setLoading(true);
    setError(null);

    const shareCode = generateShareCode();
    const { data, error: dbError } = await supabase
      .from("events")
      .insert({ name, max_budget: maxBudget, share_code: shareCode })
      .select()
      .single();

    setLoading(false);
    if (dbError || !data) {
      setError("Couldn't create the event. Check your Supabase config.");
      return;
    }
    router.push(`/event/${data.id}`);
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="max-w-md w-full space-y-6">
        <div className="space-y-2 text-center">
          <h1 className="text-3xl font-semibold">DishDecider</h1>
          <p className="text-neutral-400 text-sm">
            A shared event list where every participant&apos;s agent helps plan,
            spot duplicates, and balance the group.
          </p>
        </div>

        <div className="space-y-3">
          <input
            className="w-full rounded-lg bg-neutral-900 border border-neutral-700 px-4 py-2 outline-none focus:border-neutral-400"
            placeholder="Event name (e.g. Friday Dinner Party)"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <div className="flex items-center gap-3">
            <label className="text-sm text-neutral-400 whitespace-nowrap">
              Group budget cap ($)
            </label>
            <input
              type="number"
              className="w-24 rounded-lg bg-neutral-900 border border-neutral-700 px-3 py-2 outline-none focus:border-neutral-400"
              value={maxBudget}
              onChange={(e) => setMaxBudget(Number(e.target.value))}
            />
          </div>
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <button
            onClick={createEvent}
            disabled={loading}
            className="w-full rounded-lg bg-white text-black font-medium py-2 disabled:opacity-50"
          >
            {loading ? "Creating…" : "Create event"}
          </button>
        </div>
      </div>
    </main>
  );
}
