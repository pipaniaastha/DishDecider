# DishDecider — Demo Video Script

Target runtime: 3:00. Screen-recorded, no cuts to slides — everything happens live in the browser.

Setup before recording: two devices/windows side by side (or two browser profiles), each showing a different participant on the same event's `/event/[id]` page. One of the two must be **ChatGPT's in-app browser** (or desktop Chrome with `chrome://flags/#enable-webmcp-testing` enabled) — the recording needs to show an external agent calling DishDecider's WebMCP tools directly, not our own in-app "Ask agent" button standing in for it.

---

## 0:00–0:15 — Problem statement

- Voiceover over a static shot of a group chat scrollback full of "I'll bring chips too" duplicate messages.
- One sentence: "Potluck planning over group chat always ends in five people bringing chips and nobody bringing a main. DishDecider lets an AI agent — any agent, in any browser that supports WebMCP — coordinate the list live."

## 0:15–1:45 — Two-participant live conflict-resolution sequence (90s)

- Cut to the two side-by-side windows, both joined to the same event.
- Participant A (in the WebMCP-enabled browser): open the agent surface (ChatGPT's in-app browser or the Chrome flag's agent panel) and type a request like "I'm broke this week, something easy."
- Screen-record the agent's own tool-call trace as it decides, on its own, to call `interpret_intent` → `suggest_item` → `resolve_conflict` in sequence — pause briefly on that trace so it's legible which tool is firing and why.
- Cut to Participant B's window: the Living List updates in realtime the moment the item lands.
- Participant B's agent proposes something that collides with what A just claimed (same category, or pushes the group over budget) — show `resolve_conflict` firing again, the conflict landing in the Activity Log with its plain-language rationale, and the Living List badge flipping to "conflict."

## 1:45–2:05 — `explain_tradeoff` moment (20s)

- On the conflict entry that just appeared, click the "Why?" button.
- Show the `explain_tradeoff` call happening (network tab or the agent's tool trace) and the one-sentence rationale landing inline under the log entry, explaining why the alternative was preferred.

## 2:05–2:20 — Recap screen (15s)

- Click "View Recap" from the event dashboard.
- Pan across the four headline tiles: total spent vs. budget, conflicts resolved, suggestion acceptance rate, budget saved — then the items-by-category breakdown.

## 2:20–2:40 — `registerTool` code shot + wrap (20s)

- Quick cut to the editor: `app/webmcp/tools.ts`, scrolled to one `registerTool` call (e.g. `resolve_conflict`) so the input/output schema is readable for ~5 seconds.
- Closing line over the DishDecider logo: "Four tools, one shared source of truth, any WebMCP agent. That's DishDecider."

---

## Notes for the recording pass

- Do the two-agent sequence with real (not scripted/mocked) tool calls — the whole point is showing an external agent making its own decisions, not a canned demo.
- If the LLM reasoning call fails mid-recording, the deterministic fallback in `lib/fallback.ts` keeps the app alive rather than erroring — safe to keep rolling.
- Keep the WebMCP tool-call trace on screen long enough to read; that's the one shot a viewer can't get from the UI alone.
