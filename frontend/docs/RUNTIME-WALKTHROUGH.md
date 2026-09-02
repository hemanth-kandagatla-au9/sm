# Runtime walkthrough — browser open to last card

A root-level trace of one complete CR/CO conversation. Every step names the file
and line, the data at that moment, and who is holding it.

Read it with the code open. Line numbers are from the current tree; if one has
drifted, the surrounding code will still match.

Companions: **`ARCHITECTURE.md`** for the shape of the system,
**`DECISIONS.md`** for why each choice was made.

---

## Cast

| | | |
|---|---|---|
| `app/page.tsx` | 59 | owns one session, renders whatever the host gives it |
| `agent-ui/useAgentSession.ts` | 193 | **the only file that knows about AG-UI** |
| `app/api/agent/route.ts` | 71 | same-origin proxy to `agui_server.py` |
| `agent-ui/resolveEnvelope.ts` | 104 | is this renderable, and which source wins |
| `agent-ui/registry.tsx` | 38 | name → component |
| `agent-ui/AgentComponentHost.tsx` | 54 | look it up, render it |
| `cards/CrModeChoice.tsx` | 69 | the card we trace |
| `cards/CardShell.tsx` | 101 | avatar, bubble, meta strip |

---

# Act 0 — Boot

### 0.1 The browser asks for `/`

`next start` serves the prerendered shell for the `/` route. Nothing agent-related
has happened; there is no session, no socket, no request to `:8084`.

### 0.2 The document

`src/app/layout.tsx:14`

```tsx
<html lang="en" className={`${johnsonDisplay.variable} ${johnsonText.variable}`}>
  <body>{children}</body>
</html>
```

`fonts.ts` runs at build time — `next/font/local` self-hosts the seven Johnson
`.woff` faces and hands back two CSS variables. `globals.css` consumes them under
`@theme`, so `font-display` / `font-text` resolve everywhere without a network
request for a font.

### 0.3 Hydration

`app/page.tsx` is `"use client"`. React attaches, and two things initialise:

`app/page.tsx:19`

```ts
const AGENT_URL = process.env.NEXT_PUBLIC_AGENT_URL ?? "/api/agent/mock?scenario=flow";
```

Inlined at **build** time, not read at runtime — `NEXT_PUBLIC_*` is substituted
into the bundle. Changing it means rebuilding. In `frontend-prod` the export
script rewrites this default to `/api/agent`.

`app/page.tsx:22`

```ts
const session = useAgentSession({ url: AGENT_URL });
```

---

# Act 1 — Idle

`useAgentSession` runs on mount but **starts nothing**.

`useAgentSession.ts:62`

```ts
const [threadId, setThreadId] = useState(() => `t-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
```

The thread id is the conversation's identity. The backend keys its LangGraph
checkpoint on it — same thread id, same graph state. `reset()` mints a new one,
which is what makes it a genuinely fresh conversation rather than a cleared screen.

`useAgentSession.ts:74`

```ts
const agent = useMemo(() => new HttpAgent({ url, agentId: "cr-co", threadId }), [url, threadId]);
```

`HttpAgent` from `@ag-ui/client`. Constructing it **opens no connection** — AG-UI
is request/response with an SSE body, not a socket. One request per turn.

`useAgentSession.ts:84` — the subscription is registered now, so no event can
arrive before someone is listening:

```ts
const sub = agent.subscribe({ onCustomEvent, onStateChanged, onRunErrorEvent, onRunFinishedEvent });
return () => sub.unsubscribe();
```

### State at rest

| | |
|---|---|
| `status` | `"idle"` |
| `interruptValue` | `null` |
| `stateComponent` | `null` |
| `resolution` | `{ status: "empty" }` |

`page.tsx:30` sees `live === false` and renders the landing screen — greeting,
agent tiles, composer. `AgentComponentHost` is not mounted at all.

---

# Act 2 — The click

**Create Change Request** in the sidebar, or the CR/CO tile.

`shell/AgentSidebar.tsx` → `onStartCr` → `page.tsx:25`

```ts
function startAgent() {
  setLive(true);       // swap landing → card area
  session.start();     // kick the agent
}
```

`useAgentSession.ts:156`

```ts
const start = useCallback(() => {
  if (started.current) return;   // idempotent — a double click is one run
  started.current = true;
  void run();                    // no argument = opening turn
}, [run]);
```

`started` is a **ref**, not state, deliberately: it must be readable and writable
without causing a render, and a stale closure here would let two runs start.

---

# Act 3 — Outbound

`useAgentSession.ts:127`

```ts
const run = useCallback(async (resume?: string) => {
  if (running.current) return;          // one run at a time
  running.current = true;
  setError(null);
  setStatus("running");
  setInterruptValue(null);              // ← see below
  try {
    await agent.runAgent(
      resume === undefined ? {} : { forwardedProps: { command: { resume } } },
    );
  } catch (err) { … setStatus("error"); }
  finally { running.current = false; }
}, [agent]);
```

**`setInterruptValue(null)` before every run.** Without it a stale envelope stays
on screen and outranks whatever the next run sends, because interrupt beats state
(Act 6). Two lines, easy to mistake for a tidy-up, load-bearing.

### 3.1 The request `@ag-ui/client` builds

```jsonc
POST /api/agent/mock?scenario=flow
Accept: text/event-stream

{
  "threadId": "t-1787594820246-jubkm7",
  "runId":    "…",
  "state":    {},
  "messages": [],
  "tools":    [],
  "context":  [],
  "forwardedProps": {}        // opening turn — no resume
}
```

`forwardedProps` is always sent, even empty. The server declares
`forwarded_props: Any` with no default, which Pydantic treats as **required** — an
omission would be a 422.

### 3.2 Through the proxy

`app/api/agent/route.ts:24`

```ts
const BACKEND = process.env.AGUI_BACKEND_URL ?? "http://localhost:8084/copilotkit";
```

Read **at runtime, server-side** — unlike `NEXT_PUBLIC_AGENT_URL`. Change it and
restart; no rebuild. It is never sent to the browser, which is where auth tokens
will go when they arrive.

`route.ts:27` forwards the body and `Accept`. On failure it names the URL:

```
HTTP 502 { "error": "Could not reach the agent at http://localhost:8084/copilotkit — fetch failed" }
```

`route.ts:61` pipes the response body straight through:

```ts
return new Response(upstream.body, {
  headers: { "content-type": "text/event-stream", "cache-control": "no-cache, no-transform", "x-accel-buffering": "no" },
});
```

**No buffering, no re-encoding.** Buffer it and the stream stops being a stream —
every event lands at once, after the graph finishes, and the UI has nothing to
show meanwhile.

---

# Act 4 — The graph blocks

`node_0_show_entry` writes the envelope to state:

```python
return {"ui_component": ui_contract.cr_mode_choice(bulk_enabled=BULK_CR_ENABLED)}
```

`node_0_wait` then calls `interrupt(ui)` and **stops mid-function**. LangGraph
checkpoints, `ag_ui_langgraph` notices a pending interrupt, and emits it.

---

# Act 5 — Inbound, event by event

```
data: {"type":"RUN_STARTED","threadId":"t-…","runId":"…"}

data: {"type":"STEP_STARTED","stepName":"node_0_wait"}

data: {"type":"CUSTOM","name":"on_interrupt","value":{
         "version":1,"name":"crModeChoice","props":{…}}}

data: {"type":"STATE_SNAPSHOT","snapshot":{ …22 keys… }}

data: {"type":"MESSAGES_SNAPSHOT","messages":[]}

data: {"type":"STEP_FINISHED","stepName":"node_0_wait"}

data: {"type":"RUN_FINISHED","threadId":"t-…","runId":"…"}
```

`data: {json}\n\n`, camelCase, nulls omitted — `model_dump_json(by_alias=True, exclude_none=True)`.

### 5.1 `CUSTOM` → `useAgentSession.ts:85`

```ts
onCustomEvent({ event }) {
  if (event.name !== ON_INTERRUPT) return;
  setInterruptValue(event.value);
  setStatus("waiting");
},
```

`ON_INTERRUPT` is `"on_interrupt"` (line 33). The graph emits many custom events —
`on_chain_start`, `on_tool_end`, and so on. This is the only one we act on.

`event.value` is the envelope verbatim:

```jsonc
{ "version": 1, "name": "crModeChoice",
  "props": {
    "title": "Create Change Request",
    "subtitle": "How would you like to proceed?",
    "modes": [
      { "value": "single", "label": "Single Change Request",
        "description": "Raise one change request against a platform and target system.",
        "enabled": true },
      { "value": "bulk", "label": "Bulk Change Request",
        "description": "Raise multiple change requests from a single upload.",
        "enabled": false }
    ],
    "meta": null } }
```

**`status` becomes `waiting`, not `finished`.** The graph is blocked, and a user
is now the thing it is blocked on.

### 5.2 `STATE_SNAPSHOT` → `useAgentSession.ts:106`

```ts
onStateChanged({ state }) {
  const s = state as { ui_component?: unknown } | undefined;
  setStateComponent(s?.ui_component ?? null);
},
```

`onStateChanged`, **not** `onStateSnapshotEvent` / `onStateDeltaEvent`. It fires
for both and receives the **merged** state, so RFC-6902 deltas are already
applied. The per-event hook fires with the *patch*, and reading `agent.state`
inside it returns the state from before the patch — which produced no card at all
when `ui_component` arrived as a delta. Silent, no error.

The snapshot is the whole `AgentState` — `platform`, `target_system`, `jira_id`,
`baseline_crs`, `metrics`, `messages`, ~22 keys. We take one.

### 5.3 `RUN_FINISHED` → `useAgentSession.ts:116`

```ts
onRunFinishedEvent() {
  setStatus((s) => (s === "waiting" || s === "error" ? s : "finished"));
},
```

**The run ended; the conversation did not.** This backend finishes the run and
leaves the interrupt pending. A blind `setStatus("finished")` would render the
card inert the instant it appeared.

### 5.4 Ignored, on purpose

`STEP_STARTED` / `STEP_FINISHED` are graph telemetry. `MESSAGES_SNAPSHOT` and
`TEXT_MESSAGE_*` feed the client's own message list, which the design does not use
— the agent's words arrive as card props, not chat bubbles. They are parsed and
dropped.

---

# Act 6 — Resolution

`useAgentSession.ts` (end)

```ts
const resolution = useMemo(
  () => resolveEnvelope({ interruptValue, stateComponent }),
  [interruptValue, stateComponent],
);
```

Two values held **separately** all the way to here. Merging them earlier would
pre-empt the decision this function exists to make.

`resolveEnvelope.ts:77`

```ts
const fromInterrupt = readEnvelope(interruptValue, "interrupt");
if (fromInterrupt) return fromInterrupt;        // ← 81
const fromState = readEnvelope(stateComponent, "state");
if (fromState) return fromState;                // ← 84
return { status: "empty" };                     // ← 87
```

### Why interrupt wins

On reconnect, `agent.py`'s short-circuit path emits exactly:

```
RUN_STARTED → CUSTOM on_interrupt → RUN_FINISHED
```

**No state snapshot.** So `ui_component` is stale or absent and the interrupt
value is the only correct source. Reading state first gives a card that blanks or
reverts on reconnect — intermittent, environment-dependent, expensive later.

### The gate — `readEnvelope`, line 35

In order:

| Check | Fails to |
|---|---|
| not null | fall through to the next source |
| is an object | `malformed` — "expected an object, got string" |
| `name` is a string | `malformed` |
| `version` is a number | `malformed` |
| `version === CONTRACT_VERSION` | `unsupported-version` |
| `name ∈ COMPONENT_NAMES` | `unknown-component` |
| `props` is an object | `malformed` |

Version is checked **before** name: a future contract may rename components, so an
unknown name under an unknown version is a version problem, and the message should
say so.

Success (line 67):

```ts
{ status: "ok", source: "interrupt", name: "crModeChoice", props: { … } }
```

Note `props` is typed `unknown` here. It crossed a transport boundary; the type
system cannot know what it is until the name is validated.

---

# Act 7 — Host

`page.tsx:53`

```tsx
<AgentComponentHost resolution={session.resolution} respond={session.respond} />
```

`AgentComponentHost.tsx:35`

```tsx
const name = resolution.name;
const Card = registry[name] as AgentCard<ComponentName> | undefined;
if (!Card) return <FallbackCard … />;

const props = resolution.props as PropsByName[ComponentName];   // ← 51

return <Card props={props} respond={respond} pending={resolution.source === "interrupt"} />;
```

Three things happen on line 53:

**`registry[name]`** — `registry.tsx` maps `crModeChoice → CrModeChoice`. That is
the entire decision. No inspecting props to guess the screen; an earlier iteration
matched on `labels.includes("Similarity score:")` and that coupling is exactly what
the contract removes.

**One cast, line 51.** `props` is `unknown` because it crossed the wire. The
contract guarantees it matches `PropsByName[name]` for a validated name, and
there is no way to say "validated at runtime" to the compiler without
re-implementing the schemas. It is confined to this line; everything downstream is
fully typed.

**`pending`** — `source === "interrupt"` means the graph is genuinely blocked. A
card rendered from stale state gets `pending: false` and renders inert, so it can
never look actionable when it isn't.

---

# Act 8 — The card

`cards/CrModeChoice.tsx:24`

```tsx
export function CrModeChoice({ props, respond, pending }: AgentCardProps<"crModeChoice">)
```

`AgentCardProps<"crModeChoice">` (`types.ts:24`) resolves `props` to
`CrModeChoiceProps` — generated from the backend's JSON Schema. `props.modes[0].value`
is `"single" | "bulk"`, narrowed from the schema's `enum`. No `any`, no cast.

### Props reaching pixels

| Prop | Rendered as |
|---|---|
| `props.subtitle ?? props.title` | the message line |
| `props.modes[].label` | radio label, Johnson Display Medium 16 |
| `props.modes[].description` | muted text beside it, `ink-400` |
| `props.modes[].value` | never shown — it is what gets sent |
| `props.meta` | passed to `CardShell` → the footer strip |

`CardShell.tsx:89` wraps it: `AgentAvatar` (21), the bubble with its
**square bottom-left corner** — it is a speech bubble pointing at the avatar — and
`MetaStrip` (49) rendering `timestamp`, `processing_time`, and the `token` /
`Cost` pills from `props.meta`.

`props.meta` is `null` on this turn, so no strip. It is agent-supplied; the card
never computes it.

### One piece of local state

`CrModeChoice.tsx:26`

```ts
const [selected, setSelected] = useState<string | null>(null);
```

Purely so the radio fills the instant you click, before the round trip. **The agent
remains the source of truth for what is on screen.** If the graph came back with a
different card, this state would vanish with the component.

### Bulk stays clickable

`enabled: false` and the radio is still live. `node_0_wait` routes on
`mode == "bulk"` and never reads `enabled` — it answers with the
`featureComingSoon` card. Disabling it client-side would make that designed screen
unreachable, replacing a considered "available soon" with a dead control.

---

# Act 9 — The answer

`CrModeChoice.tsx:29`

```ts
function choose(value: string) {
  if (!pending) return;      // inert copies cannot answer
  setSelected(value);        // immediate feedback
  respond(value);            // "single"
}
```

`useAgentSession.ts:162`

```ts
const respond = useCallback((value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return;      // an empty resume is an unintended answer
  void run(trimmed);
}, [run]);
```

The empty check matters on the draft-approval node, where resuming with `""`
means something.

### The request that resumes

```jsonc
{
  "threadId": "t-1787594820246-jubkm7",     // same thread → same checkpoint
  "runId": "…",                             // new run
  "forwardedProps": { "command": { "resume": "single" } }
}
```

**Not `{ "resume": [...] }`.** `RunAgentInput.resume` exists in the protocol *and*
on `@ag-ui/client`, and `agent.py` never reads it. Sending it is accepted by
Pydantic, returns no error, and the graph never wakes. Nothing in any log explains
why.

### On the backend

`interrupt(ui)` — the call that blocked in Act 4 — **returns** `"single"`.
Execution continues from that exact point:

```python
if name == "crModeChoice":
    mode = raw.lower()
    if mode == "bulk":
        return Command(update={"ui_component": …feature_coming_soon()}, goto="node_0_wait")
    return Command(update={"ui_component": …cr_intake_form(…)}, goto="node_0_wait")
```

New envelope, `goto="node_0_wait"`, interrupt again.

---

# Act 10 — Turns 2 to 6

Acts 3 → 9 repeat. Only the card changes.

| Turn | Card | Answer sent |
|---|---|---|
| 1 | `crModeChoice` | `"single"` |
| 2 | `crIntakeForm` | labelled multi-line text |
| 3 | `templateOrCrPicker` | template ID **or** reference CR value |
| 4 | `cycleIdPicker` | the cycle value |
| 5 | `draftReview` | `"approve"` — or `"Field Name: value"` for an edit |
| 6 | `submissionResult` | — terminal |

**Nothing in `page.tsx` changes between them.** It renders `session.resolution`;
the host swaps components.

### Two turns that are not just a token

**`crIntakeForm`** also reaches the network on its own — `/api/target-systems`
when a platform is picked, `/api/jira-lookup` on a debounce. Those are the
contract's own REST helpers, deliberately not on the event stream: *"Target systems
are fetched per-platform so the agent does not need to preload them."* Its answer
is labelled text, parsed by `node_1` with an LLM.

**`draftReview`** sends `action.value` verbatim — `approve`, never the label
"Submit". `cond_edge_b`'s guard is a **substring test**, so labels are actively
dangerous: "Submit for Approval" contains no `approve`, while "I do not approve"
contains one.

Its per-field edit sends `"Field Name: value"` instead —
`node_9_hitl_wait` runs every reply through `_looks_like_field_update_message` and
routes that shape to update parsing rather than approval routing. An edit is
**this turn's answer**, not a local save.

---

# Act 11 — The last card

`submissionResult` arrives, the user answers nothing, and the graph reaches
`__end__`.

| | |
|---|---|
| `status` | `waiting` → the final `RUN_FINISHED` promotes it to `finished` only if nothing is pending |
| `interruptValue` | holds the last envelope |
| the card | renders, `pending` is whatever the last source said |

This is the one card that **disagrees with the agent**:

```ts
const missingId = props.status === "success" && !props.cr_id;
const failed = props.status === "failed" || missingId;
```

`solman_write` can return `success: true` with `cr_id: null`. Telling someone
their change request was created with no identifier to reconcile against is worse
than telling them to go and check — they would have nothing to search for. So it
renders as a failure with an explicit instruction.

`reset()` (`useAgentSession.ts:173`) mints a new `threadId`, which rebuilds the
`HttpAgent` via `useMemo` and starts a genuinely new conversation.

---

# Reference

## State machine

| status | Meaning | Set at |
|---|---|---|
| `idle` | mounted, nothing started | initial |
| `running` | a request is in flight | `run()` entry |
| `waiting` | graph blocked on an interrupt | `onCustomEvent` |
| `finished` | run ended, nothing pending | `onRunFinishedEvent` |
| `error` | `RUN_ERROR`, or the request threw | `onRunErrorEvent` / `catch` |

`running` and `started` are **refs**, not state — they gate re-entry and must not
trigger renders.

## Handlers

| Event | Handler | Line | Effect |
|---|---|---|---|
| `CUSTOM` | `onCustomEvent` | 85 | `on_interrupt` → envelope, `waiting` |
| `STATE_SNAPSHOT` / `STATE_DELTA` | `onStateChanged` | 106 | merged state → `ui_component` |
| `RUN_ERROR` | `onRunErrorEvent` | 111 | message, `error` |
| `RUN_FINISHED` | `onRunFinishedEvent` | 116 | `finished` only if not waiting |

## Failure paths

| What happens | Where | What the user sees |
|---|---|---|
| Backend unreachable | `route.ts` catch | 502 naming the URL |
| `RUN_ERROR` | `onRunErrorEvent` | the graph's message |
| Unknown component | `readEnvelope` | *"asked for X, which this app does not know how to render"* |
| Version mismatch | `readEnvelope` | *"sent contract version N; this app understands 1"* |
| Malformed envelope | `readEnvelope` | what was wrong with it |
| Nothing yet | `resolveEnvelope:87` | *"has not selected a component"* |

Every one renders a **visible card**. On a regulated approval path a blank panel
reads as "nothing happened" when the truth may be "something happened and you
cannot see what".

## When it breaks, look here first

1. **DevTools → Network → the `/api/agent` request → EventStream.** Compare the
   sequence against Act 5. If `CUSTOM on_interrupt` is absent, it is a backend
   problem, not a UI one.
2. **Console.** `assertRegistryMatchesContract()` logs implemented / not-built /
   orphaned at startup.
3. **`status` on `/dev/transport`.** Stuck at `running` means no response;
   `waiting` with no card means resolution rejected the envelope — the fallback
   will say why.
4. **A card that never advances.** Almost always the resume shape. It must be
   `forwardedProps.command.resume`.
