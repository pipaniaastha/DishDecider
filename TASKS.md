# DishDecider — Build Tasks

**Instructions for Claude Code:** Work through the unchecked tasks below, top to bottom.
For each one: implement it, run `npm run test` and `npx tsc --noEmit` to confirm nothing
broke, check the box, and move to the next. Don't add features not listed here — this
list is deliberately scoped. If something is ambiguous, make the smallest reasonable
choice and note it in a one-line comment rather than asking, unless it would affect
the data model.

Full feature context and rationale: see `README.md`. Rejected features (do NOT
implement): agent-vs-agent bidding/negotiation ("Budget Battles"), "Chaos Mode"
concurrent-flood testing, voting/consensus mechanism. These were considered and
explicitly ruled out as scope risks — do not reintroduce them.

---

## Already implemented (verified: build passes, tests pass, tsc clean)

- [x] Event creation + shareable link (`app/page.tsx`)
- [x] Zero-auth participant onboarding with dietary restrictions (`app/event/[id]/page.tsx`)
- [x] Supabase schema: events, participants, items, conflict_resolutions (`supabase/schema.sql`)
- [x] Realtime synced Living List UI (`app/event/[id]/page.tsx`)
- [x] `interpret_intent` tool (`app/webmcp/tools.ts`)
- [x] `suggest_item` tool (`app/webmcp/tools.ts`)
- [x] `resolve_conflict` tool (`app/webmcp/tools.ts`)
- [x] Consolidated `/api/llm/reason` route with Zod validation (`app/api/llm/reason/route.ts`)
- [x] Deterministic fallback logic (`lib/fallback.ts`, tested in `lib/fallback.test.ts`)
- [x] Budget math helpers (`lib/budget.ts`, tested in `lib/budget.test.ts`)
- [x] Agent Command Center input (`app/event/[id]/page.tsx`)
- [x] Conflict/Activity Log UI (`app/event/[id]/page.tsx`)
- [x] WebMCP support detection banner (`app/webmcp/types.ts`, used in event page)
- [x] MIT LICENSE, README, `.env.local.example`

---

## To build

- [x] **`explain_tradeoff` tool**
  - Add a 4th tool in `app/webmcp/tools.ts`, following the exact pattern of the other three
  - Input: `{ eventId, optionA: {name, estimatedCost, servingSize}, optionB: {name, estimatedCost, servingSize} }`
  - Output: `{ preferredOption: "A" | "B", rationale: string }` — validated with a Zod schema
  - Add a new `mode: "tradeoff"` branch to `app/api/llm/reason/route.ts` (prompt + fallback: fallback should just prefer whichever option has lower `estimatedCost`)
  - Wire it into the UI: when `resolve_conflict` returns an alternative, show a "Why?" button on the conflict entry that calls `explain_tradeoff` and displays the rationale inline
  - Acceptance: a new unit test in `lib/fallback.test.ts` covering the tradeoff fallback; `npm run build` still passes

- [x] **Passive budget flag**
  - No new tool. In `app/event/[id]/page.tsx`, after `loadState()` runs, compute `totalClaimed` via `lib/budget.ts` against the event's `max_budget`
  - If total crosses 80% of cap, insert a `conflict_resolutions` row client-side with `resolution_type: "budget"` and a rationale like `"Group is at 84% of budget — remaining items should stay under $X"` — but only once per threshold crossing (track with a ref/local flag, don't spam the log on every render)
  - Acceptance: manually verify in dev that claiming items past 80% of a small test budget produces exactly one log entry, not one per re-render

- [x] **Post-event recap**
  - New route: `app/event/[id]/recap/page.tsx`
  - Pure display: total spent vs. budget cap, number of conflict_resolutions rows, items grouped by category with counts
  - Two headline metrics, computed client-side from existing data (no new tool, no new table beyond `items.original_cost`):
    - Suggestion acceptance rate: % of items with status `claimed` vs. total suggested/claimed items (i.e. suggestions that didn't need a conflict resolution)
    - Budget saved: sum of `(original_cost - estimated_cost)` across items where `original_cost` is set and greater than `estimated_cost`
    - Set `items.original_cost` on insert whenever `resolve_conflict` swaps in a cheaper alternative — use the pre-swap `suggestRes.estimatedCost`
    - Both metrics show "—" instead of crashing or showing NaN when there's no data yet (empty event)
  - Add a "View Recap" link on the main event page
  - No new Supabase tables — query `items` and `conflict_resolutions` directly, same as the event page does
  - Acceptance: page renders correctly with an empty event (zero items) and a populated one; `npx tsc --noEmit` clean

- [x] **Demo video script**
  - Not code. Write `DEMO_SCRIPT.md` at repo root: a timestamped (0:00–3:00) shot list
  - Must explicitly show the app opened in ChatGPT's in-app browser (or Chrome with `chrome://flags/#enable-webmcp-testing`) with an external agent — not the in-app "Ask agent" button — deciding which of the four tools to call and when
  - Include: problem statement (15s), two-participant live conflict-resolution sequence (90s), explain_tradeoff moment (20s), recap screen (15s), brief `registerTool` code shot + wrap (20s)

---

## After all boxes are checked

- [ ] Run `npm run build` one final time, confirm it's clean
- [ ] Deploy to Vercel (or chosen host) and smoke-test the live URL in both Chrome-with-flag and ChatGPT's in-app browser
- [ ] Fill in real Supabase + Groq keys in the deployment's environment variables (not `.env.local` — that stays local/untracked)
