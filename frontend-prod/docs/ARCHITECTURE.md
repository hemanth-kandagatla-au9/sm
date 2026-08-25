# Architecture — how the app is wired

How a card gets on screen, where its props come from, and what happens when a
user answers. Every claim here points at a file.

Companion docs: **`DECISIONS.md`** for *why* each choice was made, and
**`docs/HANDOVER.md`** for running it against the agent.

---

## 1. The one idea everything follows

The agent never ships UI. It **names** one of eight registered React components
and supplies JSON props. A name outside the registry cannot render.

```
{ "version": 1, "name": "draftReview", "props": { … } }
```

That envelope is the entire interface between the graph and this app. Three
consequences shape every file below:

- **The frontend never decides what to show.** No inspecting props to guess which
  screen this is. The agent named it.
- **The frontend never invents content.** Labels, options, ordering, even which
  option is "positive" — all agent-supplied.
- **A card is a renderer.** Props in, one response out. No fetching for its own
  content, no routing, no store.

---

## 2. End to end, in one pass

Following a single turn from the graph to the screen and back.

```
 agui_server.py :8084                      Browser
 ─────────────────────                     ────────────────────────────────────
 LangGraph node calls
   interrupt(ui_component)
        │
        │  AG-UI SSE
        ▼
 CUSTOM  name="on_interrupt"          ┌─ /api/agent/route.ts      same-origin proxy
   value = { version, name, props } ──┤
 STATE_SNAPSHOT  { …22 keys… }        └─ useAgentSession.ts       subscribes
 MESSAGES_SNAPSHOT                            │
 RUN_FINISHED                                 │  interruptValue + stateComponent
                                              ▼
                                       resolveEnvelope.ts         validate + precedence
                                              │  Resolution
                                              ▼
                                       AgentComponentHost.tsx     registry lookup
                                              │  props, respond, pending
                                              ▼
                                       cards/DraftReview.tsx      renders
                                              │
        ┌─────────────────────────────────────┘  user clicks "Submit"
        │  respond("approve")
        ▼
 forwardedProps.command.resume = "approve"
        │
 graph resumes at the same interrupt()
```

Two details in that diagram are non-obvious and both are load-bearing —
see [§7](#7-two-protocol-details-that-look-wrong-and-are-not).

---

## 3. Layers

Four, with deliberately hard boundaries.

| Layer | Path | Role | Portable? |
|---|---|---|---|
| Contract | `src/agent-ui/` | Types, validation, registry, transport | **Yes** — zero app imports |
| Cards | `src/cards/` | The eight components + their primitives | Yes, with the contract |
| Shell | `src/shell/` | Rail, sidebar, headers, composer | **No — disposable** |
| App | `src/app/` | Routes, the proxy, tokens | No |

**`src/agent-ui/` is the deliverable.** It imports nothing from `cards/`,
`shell/` or `app/`, so it moves as a folder.

**`src/shell/` is disposable.** It reproduces the platform team's own chrome so
the flow can be demonstrated in context. On migration it is deleted and
`<AgentComponentHost>` is mounted inside their chat surface instead.

---

## 4. Where props come from

Props are **generated**, never hand-written.

```
agui/ui_contract.py                      backend, source of truth
      │  npm run contract:pull           deliberate, manual
      ▼
src/agent-ui/ui-contract.json            committed snapshot (1197 lines)
      │  npm run contract:gen            scripts/gen-contract.mjs
      ▼
contract.generated.ts                    props interfaces, COMPONENT_NAMES, CONTRACT_VERSION
fixtures.generated.ts                    the backend's own example per component
```

`scripts/gen-contract.mjs` turns each component's JSON Schema into a TypeScript
interface, and **hoists structurally-repeated sub-schemas into shared types**
rather than inlining the same shape eight times:

`DetailRow` · `OptionRow` · `CardMeta` · `FieldRow` · `DraftSection` · `CrMode` ·
`CrIntakeValues`

It throws if one name ever resolves to two different shapes — that would mean
its signature map has gone stale.

The snapshot is committed so **the build never depends on the backend being up**,
and so a contract change arrives as a reviewable diff rather than a silent
behaviour change. Refreshing is one command; a renamed prop then becomes a
compile error in the card that used it.

### The type chain

`contract.generated.ts` exports `PropsByName`, which maps each name to its props
interface. `types.ts` uses it to type a card:

```ts
// src/agent-ui/types.ts
export interface AgentCardProps<K extends ComponentName> {
  props: PropsByName[K];
  respond: Respond;          // (value: string) => void
  pending: boolean;          // is the graph actually blocked on this card?
}
```

So a card declares which component it is, and gets exactly that component's
props — no casts, no `any`:

```ts
// src/cards/DraftReview.tsx
export function DraftReview({ props, respond, pending }: AgentCardProps<"draftReview">)
```

`props.sections` is `DraftSection[]`. Rename `sections` on the backend, run
`contract:gen`, and this file stops compiling.

---

## 5. Resolution — deciding what to render

`src/agent-ui/resolveEnvelope.ts` (104 lines) is the only place an envelope is
interpreted. It takes two plain values and returns a discriminated union:

```ts
resolveEnvelope({ interruptValue, stateComponent }): Resolution
```

| `Resolution.status` | Meaning | Renders |
|---|---|---|
| `ok` | Valid envelope, known name, current version | the card |
| `empty` | Nothing pending, nothing on state | `FallbackCard` |
| `unknown-component` | Name not in the contract | `FallbackCard` |
| `unsupported-version` | Version we don't understand | `FallbackCard` |
| `malformed` | No `name`, no `props`, or a bare string | `FallbackCard` |

**Every failure is a named case, never a null.** This is a regulated
change-request path: a blank panel reads as "nothing happened" when the truth may
be "something happened and you cannot see what". `FallbackCard.tsx` states what
went wrong and tells the user their CR is not lost.

### Precedence: interrupt beats state

Both sources can carry the envelope — every HITL node calls `interrupt(ui)` *and*
writes the same object to `AgentState.ui_component`. They are **not** equally
reliable.

On reconnect, `ag_ui_langgraph`'s short-circuit path emits exactly:

```
RUN_STARTED → CUSTOM on_interrupt → RUN_FINISHED
```

**No state snapshot.** So `ui_component` is stale or absent, and the interrupt
value is the only correct render source. Reading state first produces a card that
blanks or reverts on reconnect — intermittent, environment-dependent, expensive
to diagnose later.

`pending` in `AgentCardProps` is derived from this: `source === "interrupt"`
means the graph is genuinely blocked. A card rendered from stale state renders
inert, so it can never look actionable when it isn't.

---

## 6. The registry and the host

`src/agent-ui/registry.tsx` — the whole allow-list:

```ts
export const REGISTRY: TotalRegistry = {
  crModeChoice:       CrModeChoice,
  featureComingSoon:  FeatureComingSoon,
  crIntakeForm:       CrIntakeForm,
  templateOrCrPicker: TemplateOrCrPicker,
  cycleIdPicker:      CycleIdPicker,
  draftReview:        DraftReview,
  fieldPrompt:        FieldPrompt,
  submissionResult:   SubmissionResult,
};
```

`TotalRegistry` is `{ [K in ComponentName]: AgentCard<K> }` — **total**, so a
component added to the contract without a card here fails to compile.

`AgentComponentHost.tsx` (54 lines) is the whole render decision:

```
resolution.status !== "ok"  →  <FallbackCard resolution={…} />
registry[name] missing      →  unknown-component fallback
otherwise                   →  <Card props={…} respond={…} pending={…} />
```

It does **no stage-sniffing** — it never inspects props to work out which screen
this is. An earlier iteration did (`labels.includes("Similarity score:")`), and
that coupling is exactly what the contract removes. If a heuristic ever seems
necessary here, the fix belongs in the backend's `ui_contract.py`.

`assertRegistryMatchesContract.ts` logs drift to the console in dev: a component
the agent can emit that this app cannot render, or the reverse.

---

## 7. Two protocol details that look wrong and are not

Both found by reading `ag-ui-langgraph==0.0.42`, which `agui_server.py` pins.
**The current AG-UI documentation describes a newer protocol**, and following it
fails silently in both cases. Both are commented at the point of use in
`useAgentSession.ts`.

### Interrupts are a CUSTOM event

```python
CustomEvent(type=EventType.CUSTOM, name="on_interrupt", value=<envelope>)
...
RunFinishedEvent(type=EventType.RUN_FINISHED, thread_id=…, run_id=…)
```

`RunFinishedEvent` carries **no `outcome` field**, so `agent.pendingInterrupts`
and the `outcome: "interrupt"` branch never fire. The envelope is `event.value`.

### Resume travels in `forwardedProps`

`ag-ui-protocol==0.1.19` defines `resume: List[ResumeEntry]` on `RunAgentInput`,
and `@ag-ui/client` exposes `runAgent({ resume })`. **`agent.py` never reads it.**

```ts
agent.runAgent({ forwardedProps: { command: { resume: value } } });
```

Sending `resume` is accepted by Pydantic, returns no error, and the graph never
wakes up — nothing in any log explains it.

---

## 8. The transport

`src/agent-ui/useAgentSession.ts` (193 lines) is the **only** file that knows how
the agent is reached. Everything below it takes plain values.

```ts
const { resolution, respond, status, error, start, reset } = useAgentSession({ url });
```

| Subscriber | What it does |
|---|---|
| `onCustomEvent` | `name === "on_interrupt"` → set `interruptValue`, status `waiting` |
| `onStateChanged` | merged state → set `stateComponent` |
| `onRunErrorEvent` | surface the message, status `error` |
| `onRunFinishedEvent` | only promotes to `finished` when nothing is waiting |

**`onStateChanged`, not `onStateDeltaEvent`.** The per-event hook fires with the
patch, and reading `agent.state` inside it returns the state from *before* the
patch is applied — which silently produced no card when `ui_component` arrived as
a delta. `onStateChanged` receives the merged state.

`respond(value)` clears the pending interrupt **before** running, or a stale
envelope stays on screen and outranks the next one (interrupt beats state).

### Why there is a proxy

`src/app/api/agent/route.ts` streams to `agui_server.py`, same-origin. Three
reasons: the backend's CORS allows only `:8005`; credentials can be attached
server-side when auth lands; and it replaces the Node bridge the backend team ran
on `:8006`, because this app speaks AG-UI natively.

---

## 9. Inside a card

Cards compose from shared primitives. Nothing here fetches its own content.

| Primitive | Used by | Notes |
|---|---|---|
| `CardShell` | all eight | avatar, bubble, meta strip. **Bottom-left corner square** — it is a speech bubble; avatar is bottom-aligned |
| `Field` | intake form, picker | one input, five states, driven by `state` + `disabled` |
| `Select` | any field with `options` | the designed dropdown panel — **the field becomes the panel** |
| `Radio` | mode choice, field prompt, option rows | three variants, drawn in CSS |
| `OptionRow` | template picker | radio + label + badge + **separate** disclosure |
| `SelectChip` | cycle picker | label-only chip, no radio |
| `DetailsModal` | template picker | scrim + centred dialog, two-column table |
| `DraftSection` | draft review | accordion tile; two field treatments |

### The one rule engineered hardest

On `OptionRow`, **expanding and selecting are separate actions.** The chevron
opens the details; the row body selects. Picking a baseline CR determines every
field of the resulting draft, so it must not be possible to select one as a side
effect of trying to read it.

The chevron is a **sibling** button, not nested — a button inside a button is
invalid HTML and browsers resolve the click inconsistently. The separation is
structural, not dependent on `stopPropagation` surviving a refactor.

### Two cards that legitimately talk to the network

`CrIntakeForm` and `useJiraLookup` call the contract's own REST helpers, which
the contract explicitly intends: *"Target systems are fetched per-platform from
`/api/target-systems`, so the agent does not need to preload them."*

`useJiraLookup.ts` implements four rules, each with a reason:

1. Typing fires nothing.
2. 600 ms after the last keystroke, **or immediately on blur**.
3. Only a key matching `JIRA_KEY_RE` is fetched — a partial key is **not an
   error**, because it is not a mistake yet.
4. Requests are sequence-numbered; a slow response for an old key is discarded.

Rule 5 — fill only untouched fields — lives in the card, because only the card
knows what is in them.

---

## 10. The response path

One channel out: `respond(value: string)`.

| Card | Sends |
|---|---|
| `CrModeChoice` | `"single"` / `"bulk"` |
| `CrIntakeForm` | labelled multi-line text, parsed by `node_1` with an LLM |
| `TemplateOrCrPicker` | the template ID **or** the reference CR value |
| `CycleIdPicker` | the cycle value |
| `DraftReview` | `action.value` verbatim — `approve` / `reject` |
| `FieldPrompt` | the option value, or free text |
| `FeatureComingSoon` | the back label |

**`DraftReview` sends the token, never the label.** `cond_edge_b`'s approval
guard is a **substring test**, so labels are actively dangerous: "Submit for
Approval" contains no `approve`, while "I do not approve" contains one.

**Bulk stays selectable** even though the contract sends `enabled: false` for it.
`node_0_wait` routes on `mode == "bulk"` and never reads `enabled`, answering
with the `featureComingSoon` card. Disabling it client-side would make that
designed screen unreachable.

---

## 11. Styling

`src/app/globals.css` (222 lines) is the design system. **No component contains a
raw hex.** Values are extracted from the Figma frame being built and added as
tokens first.

- Type steps are named by pixel size — `text-16`, not `text-base` — so checking a
  component against the design is a literal comparison.
- Tracking is a uniform `-0.014em`: the design's `-0.336/24`, `-0.224/16`,
  `-0.196/14` and `-0.168/12` all equal exactly that. The one exception is
  `--tracking-chip` at `+0.005em`.
- The root size tracks viewport width, so the whole UI scales as one piece and
  the design's proportions hold at any width.

`src/lib/cn.ts` registers those steps with `tailwind-merge`. Without it,
`cn("text-14 …", "text-ink-900")` **silently drops the size** — tailwind-merge
files a non-standard `text-*` under colours. Any new step must be added to
`TYPE_STEPS` there as well as to `globals.css`.

---

## 12. Adding a component

1. Builder + schema in the backend's `agui/ui_contract.py`
2. `npm run contract:pull && npm run contract:gen`
3. Write the card in `src/cards/`, typed `AgentCardProps<"yourName">`
4. Add it to `REGISTRY`

The compiler catches 2 ↔ 4 — the registry is total. The runtime drift check
catches 1 ↔ 4.

---

## 13. Development surfaces

Present in the working tree, stripped from `frontend-prod` by
`npm run export:prod`.

| Route | Shows |
|---|---|
| `/dev/tokens` | every token with its literal value, plus a viewport/scale readout |
| `/dev/contract` | all eight components from fixtures, and all five failure modes |
| `/dev/cards` | each card **pending** (interactive) and **from state** (inert) |
| `/dev/transport` | the real client against a scripted backend — five scenarios |

`src/app/api/agent/mock/route.ts` serves the **real AG-UI wire format**, copied
from the pinned server packages rather than the docs — same event sequence, full
22-key state snapshots, deltas as JSON Patch. Only the graph is scripted. A mock
that got the wire format wrong would pass here and fail against Python.

---

## 14. File map

```
src/agent-ui/                    THE DELIVERABLE — zero app imports
  ui-contract.json         1197  verbatim snapshot of the backend's contract
  contract.generated.ts     211  props interfaces, names, version
  fixtures.generated.ts     178  the backend's example per component
  types.ts                   73  AgentCardProps, Registry, Resolution
  resolveEnvelope.ts        104  validation + interrupt-beats-state
  registry.tsx               38  the allow-list, total
  AgentComponentHost.tsx     54  lookup and render
  useAgentSession.ts        193  the transport — the only AG-UI-aware file
  config.ts                  39  REST base, Jira regex, debounce
  FallbackCard.tsx           46  every failure, visibly
  assertRegistryMatchesContract.ts  59

src/cards/                       THE EIGHT + primitives
  CrModeChoice · CrIntakeForm · TemplateOrCrPicker · CycleIdPicker
  DraftReview · FieldPrompt · SubmissionResult · FeatureComingSoon
  CardShell · Field · Select · Radio · SelectChip · OptionRow
  DetailsModal · DraftSection · useJiraLookup

src/shell/                       DISPOSABLE — platform team owns this
  AppShell · IconRail · AgentSidebar · AppHeader · Composer · Greeting
  Icon · useShellStore

src/app/
  page.tsx                   59  landing → live session
  api/agent/route.ts         71  same-origin proxy to :8084
  globals.css               222  the design system
  fonts.ts                        Johnson faces

scripts/
  gen-contract.mjs          216  JSON Schema → TypeScript
  pull-contract.mjs          61  refresh the snapshot from a running backend
  figma-node.mjs            386  design extraction (dev only)
  export-prod.mjs           156  regenerate frontend-prod (dev only)
```

---

## 15. Where the seams are

When this migrates into the platform app:

**Move** `src/agent-ui/` and `src/cards/` — they import nothing from the app.

**Delete** `src/shell/`. Mount the host in their chat surface instead:

```tsx
const session = useAgentSession({ url: "/api/agent" });
<AgentComponentHost resolution={session.resolution} respond={session.respond} />
```

**Merge** the tokens in `globals.css` with theirs — the J&J brand values already
match, since both derive from the same design system.

**Keep** `scripts/gen-contract.mjs` and `pull-contract.mjs`. Without them the
contract can never be resynced.
