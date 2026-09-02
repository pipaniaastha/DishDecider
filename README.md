# DishDecider

A shared, real-time event planner where every participant's AI agent helps
coordinate — suggesting items, catching duplicate/dietary/budget conflicts,
and explaining its reasoning — on one live shared list.

## Why WebMCP

Two or more participants open the same event URL. Each person's own agent
(running in ChatGPT's in-app browser, or Chrome with the WebMCP flag) calls
tools registered directly on the page via `document.modelContext.registerTool`.
When Alice's agent claims "Mac & Cheese," Bob's agent — acting independently,
on his own device — sees the live state and steers him away from a duplicate.
That kind of cross-agent coordination on shared state isn't possible when
agents can only act inside their own chat thread.

## The three tools

| Tool | Role |
|---|---|
| `interpret_intent` | Parses open-ended text ("I'm broke this week") into structured constraints. Pure parser — never recommends. |
| `suggest_item` | Recommends a specific dish given constraints + current list, avoiding duplicates. Pure generator — never validates. |
| `resolve_conflict` | Checks a proposed item against the live event state (duplicates, dietary clashes, budget) and returns a resolution. Pure validator — never generates from scratch. |

All three route through a single `/api/llm/reason` endpoint (mode-dispatched),
with Zod validation on every response and a deterministic fallback if the
model call fails, so a flaky LLM response never breaks the live demo.

## Setup

```bash
npm install
cp .env.local.example .env.local   # fill in Supabase + Groq keys
```

Run `supabase/schema.sql` in your Supabase project's SQL editor, then:

```bash
npm run dev
```

## Testing WebMCP

- **ChatGPT in-app browser**: open the deployed URL directly, supports WebMCP out of the box.
- **Chrome**: enable `chrome://flags/#enable-webmcp-testing`. The app shows a banner if WebMCP isn't detected.

## Tests

```bash
npm run test
```

Covers the deterministic fallback logic and budget math — the two things
that need to be reliably correct even when the LLM layer is unavailable.

## License

MIT — see [LICENSE](./LICENSE).
