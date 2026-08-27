# Decisions & Gaps

Running log for the CR/CO agent frontend R&D. Every entry records what was
decided, **why**, and what it costs us — so that a future reader (or the platform
team inheriting this) can re-open a decision on its merits rather than guessing
at the reasoning.

Two sections: **Decisions** (choices we made) and **Gaps** (things that are
missing, unsupported, or unresolved). A gap that gets resolved becomes a
decision and stays in both places, cross-referenced.

Status values: `settled` · `provisional` · `open` · `superseded`

Last updated: 2026-08-24

---

## Context

We are building a frontend for the SolMan CR/CO LangGraph agent, independently of
the platform team's existing app, to prove out the **controlled-UI** model:

> The agent never ships UI. It names one of a fixed set of registered React
> components and supplies JSON props. Anything not in the registry cannot render.

Two reference codebases, both **read-only** — never run, never modified:

| Reference | What it is | What we take from it |
|---|---|---|
| `solman_cr_co_*.zip` | Backend team's LangGraph agent + AG-UI host | The contract only (`agui/ui_contract.py`, `agui_server.py` `/api/*`) |
| `ai-sdlc-frontend-*.zip` | Platform team's Next.js app | Migration target — stack, conventions, brand system |

Design source: Figma `OKMf8QB5HkTjgaT3lDR438`, section **SolMan CR/CO Agent /
Single CR** (`59556:22595`).

---

## Decisions

### D1 — Build as an independent app, not inside the backend repo
**Status:** settled

A previous attempt lived at `solman_cr_co/frontend/`. It has been discarded
entirely and is not referenced.

**Why.** The frontend and backend deploy independently and are owned by different
teams; that is the premise of the whole contract. Nesting the app inside the
agent repo makes that boundary invisible and invites imports across it. A
separate tree makes "independent" structurally true rather than a convention
someone has to remember.

**Cost.** The contract snapshot must be pulled deliberately rather than imported.
That is a feature — see D6.

---

### D2 — Next.js 16 App Router, not Vite
**Status:** settled

Pinned to the platform app's exact versions: Next **16.1.6**, React **19.2.3**,
Tailwind **v4**, TypeScript 5 strict.

**Why.** The stated goal is that this work eventually migrates *into* the
platform app. Matching their stack byte-for-byte turns that migration into a
folder move instead of a rewrite. The discarded attempt was Vite, which would
have guaranteed a port.

Secondary benefit: the CopilotKit runtime bridge that the backend team ran as a
third Node process (`agui_runtime/server.mjs` on :8006) collapses into a Next
route handler. Three processes become two, CORS disappears because everything is
same-origin, and the `/api/*` helpers can be proxied server-side rather than
called cross-origin from the browser.

**Cost.** We inherit Next's server/client component split, which the cards must
respect (`"use client"` at the host boundary).

---

### D3 — Tailwind v4 + Radix, not MUI
**Status:** settled

The platform app carries **both** MUI 9 and shadcn/Radix + Tailwind.

**Why.** The requirement is "exactly like Figma, no compromise on UI". Matching a
pixel-specified design in MUI means fighting its theme layer on every component;
in Tailwind we write the Figma value directly. The platform app already ships
`components.json` and a shadcn-shaped `globals.css`, so this is also the more
migratable of their two systems.

**Cost.** If the platform team standardises on MUI later, the cards need
restyling. The props/behaviour contract would survive that — only class names
change.

---

### D4 — The token file is the design system; no hex inline in a component
**Status:** settled

**Why.** The Figma file is barely tokenised — only two real variables exist
(`Primary/Red #eb1700`, `Gray/gray-100 #202020`). Everything else is raw hex on
frames. If components carried literal hex, "does this match the design?" would
become unanswerable without opening Figma next to every file.

So `src/app/globals.css` is the token system. Values are extracted from
`get_design_context` on the actual frame being built, added there first, and
referenced by name. Type steps are named by pixel size (`text-16`, not
`text-base`) and carry their Figma tracking and leading, so checking a component
against the design is a literal comparison rather than a translation.

**Cost.** The token file grows as we reach new frames. Accepted — additive, and
each addition is traceable to a frame ID.

**See also:** G3.

---

### D5 — Use the branded Johnson faces supplied by the user
**Status:** settled

Seven `.woff` faces: Display Light/Regular/Medium/Bold, Text
Regular/Medium/Bold. Wired via `next/font/local`, all verified loading.

**Why.** They are the licensed brand fonts and were supplied explicitly. The
platform app has a *different* subset (`.woff2`, includes Text Light, lacks
Display Bold/Light) — we do not mix sources.

**Cost.** No Johnson Text Light. See G4.

---

### D6 — Generate contract types; commit fixtures; build without the backend
**Status:** settled

`src/agent-ui/ui-contract.json` is a verbatim snapshot of the backend's
`agui.ui_contract.contract_document()`. `scripts/gen-contract.mjs` turns it into
TypeScript interfaces and a fixture per component.

**Why three things at once.**

1. **Hand-written types drift.** A prop rename on the backend should be a compile
   error here, not a blank card in QA. Generation makes that automatic.
2. **The contract ships its own examples.** Committing them means every card can
   be built and reviewed against real payloads with **nothing running** — which
   is a hard requirement here, since we are not to run the backend.
3. **The snapshot is committed, and refreshing it is a manual step**
   (`npm run contract:pull`). An automatic fetch at build time would make our
   build depend on their uptime and would let a contract change land silently.

The generator hoists structurally-repeated sub-schemas into named interfaces
(`DetailRow`, `OptionRow`, `CardMeta`, `FieldRow`, `DraftSection`, `CrMode`,
`CrIntakeValues`) rather than inlining the same shape eight times, and throws if
one name ever resolves to two different shapes — that would mean its signature
map has gone stale.

**Cost.** The snapshot can lag the backend. Mitigated by `contract:pull`
reporting added/removed components, and by the runtime drift check (D9).

---

### D7 — A pending interrupt outranks agent state as the render source
**Status:** settled

`resolveEnvelope()` reads the interrupt value first and falls back to
`AgentState.ui_component`.

**Why.** Every HITL node calls `interrupt(ui)` with the component envelope *and*
writes the same envelope to state. These are not equally reliable. The AG-UI
interrupt contract specifies that `StateSnapshot` is emitted **before** the
interrupt-carrying `RunFinished` and is deliberately **not** resent when a client
reconnects to an already-open interrupt — so that replay-based and
checkpoint-based resumption behave identically.

A transport reconnect while a card is on screen therefore re-delivers the
interrupt but no fresh snapshot. Reading state first produces a card that blanks
or reverts on reconnect: intermittent, environment-dependent, and expensive to
diagnose months later.

This is cited at the decision point in `resolveEnvelope.ts` so it does not get
"simplified" away.

**Confirmed in code, against the pinned version.** The spec argument above is
about the *current* AG-UI protocol; this backend runs `ag-ui-langgraph==0.0.42`,
so it was worth checking rather than assuming. `agent.py`'s reconnect path —
`if has_active_interrupts and not has_resume_input` — dispatches exactly three
events:

```python
RunStartedEvent(...)
CustomEvent(name="on_interrupt", value=dump_json_safe(interrupt.value))   # per interrupt
RunFinishedEvent(...)
```

**No `StateSnapshotEvent`.** Reconnecting to a pending interrupt therefore never
re-sends `ui_component`, and the interrupt's `value` is the only render source
available. The rule holds for the version we are actually integrating with, not
just the version the docs describe.

**Sources:** <https://docs.ag-ui.com/concepts/interrupts> ·
`ag_ui_langgraph-0.0.42/agent.py`

---

### D8 — Keep the contract layer transport-agnostic
**Status:** settled (the transport choice itself is **open** — see G1)

I initially validated the integration path using CopilotKit, since that is what
the backend team's working configuration used. After checking the current AG-UI
and CopilotKit specifications I identified a support gap around our headless
LangGraph/FastAPI interrupt model (G1).

Rather than let that block progress, the UI contract, validation, registry and
host were deliberately built to know nothing about who delivers an envelope.
`resolveEnvelope()` takes two plain values — an interrupt payload and a state
object — and returns a typed `Resolution`. No CopilotKit import exists anywhere
in `src/agent-ui/` today.

**Why.** The transport decision is genuine R&D with a real chance of reversal.
Binding eight cards and the whole contract layer to a client library before
resolving it would make that reversal expensive. This way it is one file.

**Cost.** One extra indirection (`useAgentSession`) between the transport and the
host. Cheap, and it doubles as the seam the platform team will re-point at their
own transport.

---

### D9 — Registry starts partial, becomes total
**Status:** provisional — becomes settled when the eighth card lands

`Registry` is `{ [K in ComponentName]?: AgentCard<K> }` while cards are built one
per review gate. It becomes total once all eight exist.

**Why.** A total registry today would force eight stub components, which makes
the drift check meaningless — it would report full coverage while nothing is
built. Partial + a runtime report tells the truth about where we are, and the
report is visible at `/dev/contract`.

A component in the contract with no card renders `PlaceholderCard`
("not built yet"); a contract violation renders `FallbackCard`. **These are
deliberately different.** Collapsing them would hide real drift behind expected
build-out noise.

When the registry becomes total, a missing card is a compile error and
`PlaceholderCard` is deleted.

---

### D10 — Every failure mode renders a visible, specific card
**Status:** settled

Unknown component, unsupported version, malformed envelope, and empty each
produce a distinct message naming what went wrong.

**Why.** This is a regulated change-request path. `solman_write` can return
`success: true` with `cr_id: null`; a graph can be mid-approval when a contract
mismatch lands. A blank panel reads as "nothing happened" when the truth may be
"something happened and you cannot see what". The fallback also tells the user
their CR is not lost and to check SolMan — an instruction, not an apology.

There is no Figma frame for these states; they are an engineering safety net,
built from tokens so they cannot drift off-brand.

---

### D11 — The host does no stage-sniffing
**Status:** settled

The host never inspects props to infer which screen this is. The agent names the
component; the host looks it up.

**Why.** The backend team removed exactly this from a previous iteration —
heuristics like `labels.includes("Similarity score:")` and
`options.some(o => o.value === "approve")`. Those couple the frontend to prose
and to option values, both of which change without notice. If a heuristic ever
seems necessary here, the fix belongs in the backend's `ui_contract.py`.

---

### D12 — The app shell is explicitly disposable
**Status:** settled

Three layers with hard boundaries:

```
src/agent-ui/   THE DELIVERABLE. Contract, registry, host, transport seam.
                Zero app imports. Portable as a folder.
src/cards/      The eight cards. Props in, respond() out.
                No fetch, no store, no router. Ever.
src/shell/      Rail, sidebar, headers, composer. DISPOSABLE.
```

**Why.** The Figma landing screen shows the platform team's shell — J&J rail,
agent list, role selector, composer. That surface sits *outside* the agent
contract and they already own it (`components/chat`, `chatBoard`,
`store/useChatStore.ts`). We build a thin version so the flow is demonstrable,
but marking it disposable stops anyone mistaking it for the deliverable.

The rule that keeps migration cheap is the middle layer: **a card takes props and
emits a response, and does nothing else.**

---

### D13 — No hardening yet, but three things are not negotiable
**Status:** settled

Deliberately deferred: auth/MSAL, test suites, Docker/Helm/Jenkins, i18n,
error-boundary polish, telemetry.

Deliberately **not** deferred, because each is expensive to retrofit and free
now:

- **TypeScript strict** — retrofitting types onto eight cards is a rewrite.
- **The contract drift check** — its value is catching a mismatch the day it
  appears, which requires it to exist from the start.
- **Token-only styling (D4)** — a component that ships with inline hex will keep
  its inline hex forever.

---

### D14 — Icons are the exported Figma assets, committed
**Status:** settled

All 24 shell icons are downloaded from the design file into `public/shell/` and
rendered through `<Icon>` with **both** dimensions stated explicitly.

**Why.** `lucide-react` is a dependency and its glyphs are close to several of
these — but "close" is exactly what the no-compromise requirement excludes. The
J&J mark, the New Chat spark and the three agent glyphs have no lucide
equivalent at all. Committing the assets also matters because Figma's export
URLs expire in about seven days; referencing them directly would produce a
frontend that silently loses its icons a week later.

Sizes are stated per call rather than by a blanket descendant rule, so an icon
designed at 27×16 (the agent-row chevrons) is not flattened to a square by a
global `size-4`.

---

### D15 — The fixed artboard is adapted to the viewport, not reproduced literally
**Status:** settled

The design is a fixed 1512×982 frame. The shell keeps the **designed** sizes for
everything the design fixes — rail 92px, sidebar 228px, header bands 88px, the
750px greeting measure — and lets the chat column take the remaining space and
scroll.

**Why.** Reproducing 982px literally would produce an app that clips on a laptop
and floats on a large monitor. The artboard cannot express "this column scrolls";
that is an implementation concern the design delegates. Verified: all 32 measured
values match the design exactly at 1512×982.

---

### D16 — Scope is the CR/CO "Create Change Request" path, and nothing else
**Status:** settled

**In scope.** The Single CR flow reached from **CR/CO Agent → Create Change
Request**: the eight contract components and everything they need.

**Not in scope — future, deliberately not built.** SASA, Workshop Assist and any
other agent; the other three rail destinations; Bulk CR (also G5); search;
recent-conversation history; role switching; the persona menu.

Those surfaces exist in the shell **only** so the CR/CO flow can be demonstrated
in its real context. They render, they are not wired, and no effort goes into
them.

**Why write this down.** The Figma page contains far more than our flow — Admin
Persona MVP1, iWand, Setup/Projects, Permissions, monitoring. Without an explicit
boundary, "match the design" reads as "build the design", which is a different
and much larger project. It also stops a future reader mistaking an unwired tile
for an unfinished feature.

---

### D17 — Scale the UI proportionally below the 1512px reference width
**Status:** settled

`html { font-size: clamp(12px, calc(100vw / 94.5), 16px) }`, with every token in
`rem`.

**Why.** The design is authored at 1512×982. Reproducing its values literally
means the fixed chrome — 92 + 228 rail/sidebar, 88 + 88 header bands — consumes a
much larger share of a smaller viewport than the design intends. On a Windows
laptop at 150% display scaling, which reports **1280×720 CSS px**, the chrome
took **25%** of the width against the design's 21.2%, and the UI read as
"zoomed in" at 100% browser zoom.

The alternative was a responsive type scale that steps sizes down at
breakpoints. Rejected: that deviates from the design at every width except 1512,
which is exactly what "no compromise on UI" rules out. Proportional scaling
deviates at *no* width — it is the same design, drawn smaller.

Measured after the change: at 1280 the chrome is **21.2%**, matching the design
exactly, and all nine sampled dimensions land within 0.02px of
`design × (viewport / 1512)`.

**Details worth keeping.**

- **Tracking moved from px to em, and it turned out to be one value.**
  `-0.336/24`, `-0.224/16`, `-0.196/14` and `-0.168/12` all equal exactly
  `-0.014`. The design uses a consistent −1.4% tracking; in `em` it scales with
  the type instead of drifting at other sizes.
- **Icons size in rem**, not px — `<Icon>` converts. Left in px they would have
  stayed pinned while everything around them shrank.
- **Borders stay in px.** A 1px rule scaled to 0.85px renders inconsistently
  across browsers, and hairlines are not something the eye reads proportionally.
- **Capped at 16px** above the reference width: past 1512 the right behaviour is
  more room, not bigger text. **Floored at 12px** for legibility; below ~1134px
  the layout compresses rather than shrinking further.

**Cost.** Every new dimension must be authored in rem. Mitigated by the token
file (D4) — components reference tokens, and Tailwind's own spacing scale is
already rem.

---

### D18 — Shell interactions: build what the design defines, leave the rest inert
**Status:** settled

Both navigation panels have real collapsed/expanded variants in Figma, and both
are implemented:

| Panel | Expanded | Collapsed |
|---|---|---|
| Rail (Side Navigation-01) | 228px — full J&J wordmark, four labelled destinations | 92px — shorthand mark, icons only |
| Sidebar (Side Navigation-02) | 228px — New Chat, search, agent list, recents | 92px — spark, agent chips, recents calendar |

Also wired: agent-row expand/collapse, agent search filtering, and the recent
conversations toggle.

**Deliberately inert:** the SASA and Workshop Assist chevrons. They render
exactly as designed and do nothing. The design defines no children for either
agent — only CR/CO has a designed child row ("Create Change Request") — so
making them expand would mean inventing a submenu nobody has specified. Per D16
those agents are out of scope; a chevron that opens invented content is worse
than one that does not open.

Also not built: the persona menu and the role-selector dropdown. Both render as
designed; neither has a designed open state in this frame set.

**Note on the two panels' borders.** The collapsed sidebar uses a 1px
`#f3f3f3` right border while the expanded one uses a 0.5px `#e2e8f0`. That looks
like an inconsistency but it is what the design specifies, and both are
reproduced rather than normalised.

---

### D19 — Bulk stays selectable even when the contract says `enabled: false`
**Status:** settled

`crModeChoice` arrives with `modes[bulk].enabled === false` (the builder reads
`BULK_CR_ENABLED`, currently `False`). We render it as a live, selectable option
anyway.

**Why.** `node_0_wait` routes on `mode == "bulk"` and **never reads `enabled`**.
When bulk is off the graph answers with the `featureComingSoon` card — a
designed screen with its own message and a "Back to Single Change Request"
action. Disabling the option client-side would make that screen unreachable and
replace a considered "available soon" explanation with a dead control the user
cannot learn anything from.

This matches the backend team's own instruction: *"Bulk is not blocked
client-side. The tile stays clickable and posts `{"mode":"bulk"}`; the backend
answers with the `featureComingSoon` card."*

So `enabled` is **informational**, not a gate. If we ever want a visual hint on a
disabled mode it must not remove the click.

---

### D20 — Extract `CardShell` before the first card, not after the third
**Status:** settled

The avatar, bubble and meta strip live in `cards/CardShell.tsx`; cards supply
only their content.

**Why.** All eight cards share this chrome, and the meta strip is **contract
data** (`CardMeta` — timestamp, processing time, tokens, cost), not something a
card computes. Letting the first card own its own footer would guarantee eight
slightly different footers and a painful consolidation later.

Two details from the design worth keeping visible, because both look like bugs
if you meet them cold:

- The card's **bottom-left corner is square** while the other three are 16px. It
  is a speech bubble pointing at the avatar.
- The avatar is **bottom-aligned** with the card (`items-end`), not top-aligned.

---

### D21 — Extract design from the Figma REST API, not the MCP server
**Status:** settled

`scripts/figma-node.mjs`, run as `npm run figma -- <node-id>`, authenticated with
a Personal Access Token in `.env.local`.

**Why.** The MCP server's per-plan call quota ran out mid-build (G14) and would
have gated the seven remaining cards. The REST API is a **separate quota**, free
on every plan including Starter, and returns the node JSON as authored — fills,
strokes, effects, typography, auto-layout, corner radii — rather than a
pre-converted React/Tailwind rendering. Since every extraction was being
translated into our token vocabulary by hand anyway (D4), the raw form is
actually the better input.

**The part that earns its keep.** The script parses `globals.css` and annotates
every colour it finds with the matching token name, or marks it `NEW`. So the
output directly answers the question that D4 makes us ask on every frame — is
this an existing token, or a value that has to be added first? — instead of
leaving it to eyeballing hex codes.

Also renders frames: `npm run figma -- <node-id> --png` writes 2× PNGs to
`_ref/figma/shots/`.

**Credential handling.** The token lives only in `frontend/.env.local`, which is
covered by `.env*` in `.gitignore`. It is never committed, never logged, and was
deliberately not pasted into any chat transcript. Scope is `file_content:read` —
read-only, single file's worth of access.

**Cost.** We convert raw Figma JSON ourselves rather than receiving Tailwind. In
practice that was already the work; what we lose is a starting draft we were
discarding anyway.

---

### D22 — One `Field` with a `state` prop, not nine field components
**Status:** settled

Figma's component set has nine variants. They share identical geometry — 55px
tall, 24px horizontal padding, 16px radius, label 14/500 above at 6px gap, helper
12/400 below — and differ only in border colour, helper colour, fill and trailing
adornment.

**Why one component.** Nine components would duplicate that geometry nine times,
and the next time a padding changes it would have to change in nine places. The
variants are *states of one control*, which is what the Figma set is expressing.

`Field` is strictly presentational: no fetching, no debouncing, no validation.
Those rules are the agent's, so they live in the card that owns the form.

| State | Border | Helper |
|---|---|---|
| `default` | `line`, `brand-a12` on hover | `ink-600` |
| `disabled` | `line` + `field-disabled` fill | `ink-600` |
| `error` | `error` `#d01400` | `error` |
| `missing` | `warning` `#f7b715` | `warning` |
| `verified` | `success` `#0b7929` | `success` |

---

### D23 — The Jira lookup rules live in their own hook
**Status:** settled

`cards/useJiraLookup.ts`. Four rules, each with a reason, all verified against
the running component:

1. **Typing fires nothing.** Verified: 0 requests 300ms after a keystroke.
2. **600ms after the last keystroke, or immediately on blur** — leaving the field
   means the user is done. Verified: a blur issues the request within 120ms,
   well inside the debounce.
3. **Only a key matching `JIRA_KEY_RE` is fetched, and a partial key is not an
   error.** Colouring a field red while someone is mid-word is noise, not
   feedback. Verified: `"AAZ"` produces no request and no error state.
4. **Requests are sequence-numbered.** Verified: with an artificially slow
   response for an older key, the form kept the newer key's data.

Rule 5 — fill only fields the user has not typed in — lives in the card, since
only the card knows what is in them. Verified: a hand-edited Reason survived a
later lookup while the untouched Description was replaced.

**A bug this testing caught.** `onBlur` originally closed over `values.jira_id`
from the last render. A blur arriving before React re-rendered read a stale value
and short-circuited the lookup — precisely the case rule 2 exists for. `Field`
now passes the value from the event, and the prop is typed
`(value: string) => void` to make that the only option.

The same superseded-response problem exists for target systems, so those are
stored keyed by the platform they were fetched for and ignored if the platform
has since changed.

---

### D24 — Drop CopilotKit; connect with `@ag-ui/client` directly
**Status:** settled — resolves G1

The R&D brief was to evaluate **both** AG-UI and CopilotKit. Both were evaluated;
this is the conclusion, reached by reading the pinned packages rather than the
marketing docs.

#### The finding that decides it

`agui_server.py` calls `add_langgraph_fastapi_endpoint(app, agent, "/copilotkit")`.
Unpacking `ag-ui-langgraph==0.0.42` shows what that actually creates:

```python
@app.post(path)
async def langgraph_agent_endpoint(input_data: RunAgentInput, request: Request):
    ...
    return StreamingResponse(event_generator(), media_type=encoder.get_content_type())
```

A plain POST that accepts a bare `RunAgentInput` and streams SSE-encoded AG-UI
events. **That is the AG-UI HTTP protocol.** Nothing about it is
CopilotKit-specific — the path is merely *named* `/copilotkit`.

So `new HttpAgent({ url: ".../copilotkit" })` connects to it directly. The Node
bridge the backend team ran on :8006 existed only because CopilotKit's React
client speaks CopilotKit's own GraphQL protocol and needed a translator. Speaking
AG-UI natively removes the translator **and** the thing being translated to.

#### Two adaptations this backend requires

Both were found by reading `ag_ui_langgraph/agent.py`, and neither is guessable
from the AG-UI docs, which describe a newer protocol than 0.0.42 implements:

**1. Interrupts arrive as a CUSTOM event, not as `RunFinished.outcome`.**

```python
CustomEvent(type=EventType.CUSTOM,
            name=LangGraphEventTypes.OnInterrupt.value,   # "on_interrupt"
            value=dump_json_safe(interrupt.value))
...
RunFinishedEvent(type=EventType.RUN_FINISHED, thread_id=..., run_id=...)
```

`RunFinishedEvent` is constructed with **no `outcome` field at all**. The current
AG-UI spec's `outcome={type:"interrupt", interrupts:[…]}` is never emitted, so
`RunFinishedInterruptOutcome` and the subscriber path built around it will never
fire against this backend. The interrupt payload — our `ui_component` envelope —
is the `value` of a custom event named `on_interrupt`.

**2. Resume goes through `forwardedProps`, not through `resume`.**

`ag-ui-protocol==0.1.19` *does* define `resume: Optional[List[ResumeEntry]]` on
`RunAgentInput`, and `@ag-ui/client` 0.0.58 *does* expose `runAgent({ resume })`.
**`agent.py` never reads it.** It reads `forwarded_props['command']['resume']`.

This is the sharpest trap in the whole integration: sending `resume` is accepted
by Pydantic, returns no error, and silently does nothing — the graph simply never
resumes. Anyone following the current AG-UI docs would hit it and have no signal
as to why.

The client must send `forwardedProps: { command: { resume: <value> } }`. Keys are
camel→snake converted server-side, so `forwardedProps` arrives as
`forwarded_props`.

#### Why not stay on CopilotKit

CopilotKit does exactly these two things internally, and adds:

| | |
|---|---|
| An extra protocol hop | its GraphQL layer, and a runtime to host |
| An unsupported path | its own docs state *LangGraph (FastAPI) doesn't support Human in the Loop: Headless Interrupts* — and headless is our entire model, since cards render in our layout, not its chat |
| A superseded API | `useLangGraphInterrupt` is marked superseded by `useInterrupt` in v2 |
| Unused surface | its chat UI, which the Figma design replaces wholesale |

We would be depending on an unsupported path, through a protocol translator, to
reach an endpoint that already speaks the protocol we want.

#### A compatibility risk that turned out fine

`ag_ui.core.types.ConfiguredBaseModel` sets `extra="allow"` with
`alias_generator=to_camel` and `populate_by_name=True`. So a newer client sending
fields 0.1.19 does not know about is **accepted, not rejected**. The 0.0.58 client
against the 0.1.19 server is safe on that axis.

#### Cost

We implement the event loop ourselves rather than getting hooks. That is roughly
one file — subscribe, filter `on_interrupt`, track state snapshots and deltas,
resume through `forwardedProps`. Against that: no bridge process, no GraphQL, no
unsupported path, and the two quirks above become explicit, commented code rather
than behaviour buried in a dependency.

It also vindicates **D8** — because nothing was bound to CopilotKit, this
decision costs one new file and changes no card.

#### Implemented and verified

`agent-ui/useAgentSession.ts` plus two routes: `/api/agent` (same-origin proxy to
`agui_server.py`) and `/api/agent/mock` (a scripted backend that serves the real
AG-UI SSE wire format, so `HttpAgent`, its parser and every subscriber path are
the production ones — only the graph is scripted).

Verified at `/dev/transport`:

| Check | Result |
|---|---|
| Opening turn | `idle → waiting`, renders `crModeChoice` **from interrupt** |
| Resume cycle | mode choice → `crIntakeForm` → form submit → `templateOrCrPicker` |
| Reconnect, **no state snapshot** | card still renders, from the interrupt — D7 proven empirically, not just argued |
| `RUN_ERROR` | `status=error`, message surfaced, no blank panel |

**The trap, demonstrated.** Two identical conversations, differing only in where
the resume value was put:

```
thread A — forwardedProps.command.resume   (what agent.py reads)
  turn 1: crModeChoice   turn 2: crIntakeForm   turn 3: templateOrCrPicker

thread B — RunAgentInput.resume            (what the AG-UI docs say)
  turn 1: crModeChoice   turn 2: crModeChoice   turn 3: crModeChoice
```

Thread B never advances and never errors. Anyone following the current docs would
see a card that simply refuses to move on, with nothing in any log to explain it.

---

### D25 — Check layer visibility before rendering anything from a component set
**Status:** settled

The field component set defines an `icon/info` adornment and a "Helper Text" line
on its `default` variant. Both are present in the API response for the real form
instances — and both are `visible: false`.

Rendering them because the component set has them would have put an icon and a
stray helper line under every text field that the design deliberately hides.

`scripts/figma-node.mjs` now marks any node with `visible === false` as
`← HIDDEN, do not render` and does not descend into it. Worth noting that the
MCP output did **not** surface this distinction, and neither does a screenshot at
small scale — the icon is a 16px `#4a5567` glyph that reads as noise.

**The general rule:** a component set describes what a component *can* show. The
instance on the frame describes what it *does* show. Build from the instance.

---

### D26 — The option "expansion" is a modal, not an inline panel
**Status:** settled

`AGUI_INTEGRATION.md` describes reference CRs as rows that *expand*: "The chevron
toggles the panel; the row body selects." The design does something different —
Figma `59602:11759` puts a full-screen `rgba(0,0,0,0.12)` scrim behind a centred
787×398 dialog (`59602:12443`) containing a two-column table.

Built as designed. Where a prose description and the design file disagree about
presentation, the design file wins; the doc's *behavioural* rules still hold, and
those are the part that matters (D27).

The table is a CSS grid rather than a `<table>` — it is a label/value list, grid
keeps the columns aligned, and a `wide` row can span both. Row semantics are
carried by `role="table"/"row"/"rowheader"/"cell"`.

`DetailsModal` was written to be reusable: `draftReview` has the same
three-level disclosure problem and should not grow a second dialog.

---

### D27 — Expanding and selecting are separate, enforced structurally
**Status:** settled

On `templateOrCrPicker` the chevron opens the details; the row body selects and
**answers the interrupt immediately** — there is no submit button on this card.

**Why this is worth engineering carefully.** Picking a baseline CR determines
every field of the resulting draft. Selecting one as a side effect of trying to
read it would be a silent, consequential mistake, and the user would have no
reason to suspect it happened.

So the chevron is a **sibling** button, not a nested one. A button inside a
button is invalid HTML and browsers resolve the click inconsistently; making them
siblings means the separation is structural rather than dependent on
`stopPropagation` surviving a future refactor.

A row whose `details` are absent or empty renders **no chevron at all**, rather
than one that opens an empty dialog.

Verified: clicking the chevron opens the dialog, leaves the radio
`aria-checked="false"`, and sends no response. Clicking the row selects and
responds.

**Tone comes from the agent.** In the fixture the Platform row carries
`tone: "positive"` and renders green while the others render `ink-600` — because
`positive` on Platform means *the agent matched it against the user's platform*.
Deriving that client-side would invent a claim the agent never made.

---

### D28 — The demo runs in the real shell, not only in the gallery
**Status:** settled

`src/app/page.tsx` holds a live `useAgentSession`. "Create Change Request" (in
the sidebar, or the CR/CO tile) starts the agent; from that moment every screen
comes from the contract and nothing in `page.tsx` decides what is shown.

Defaults to the scripted backend so the flow runs with nothing else running. Set
`NEXT_PUBLIC_AGENT_URL=/api/agent` to point it at `agui_server.py`.

Verified: landing → chat title changes to "Create Change Request" → `crModeChoice`
→ answering "single" → `crIntakeForm`, with the rail, sidebar and composer intact
throughout. The composer's free text goes to the same resume channel, which is
what `fieldPrompt` expects.

---

### D29 — `cycleIdPicker` uses a label-only chip, not the reference-CR row
**Status:** settled

`SelectChip` — Figma component set "Platform Selection" (`59463:12746`):

| Variant | Fill | Border | Label |
|---|---|---|---|
| Default | `option-bg` | `line-soft` | `ink-900` |
| Hover | `option-bg` + drop shadow | `line-soft` | `brand` |
| Clicked | `brand-a08` | `brand-a24` | `brand` |

**No radio**, unlike `templateOrCrPicker`'s rows — and the reason is structural,
not stylistic. Those rows carry a *separate* disclosure control, so the selection
affordance has to be visually distinct from the row itself (D27). A chip is the
whole hit target, so fill and label colour carry the state on their own.

The design lays the chips four per row. That is a consequence of their natural
width at that card width, not a rule, so the implementation **wraps** — a longer
cycle name would otherwise clip or blow the card out.

---

### D30 — Teach `tailwind-merge` about our type steps
**Status:** settled — **cross-cutting bug fix**

`cn()` now uses `extendTailwindMerge` to register `text-10/12/14/16/20/24/64` as
the font-size group.

**The bug.** Our steps are named by pixel size (D4), which collides with how
tailwind-merge disambiguates `text-*`. It cannot tell `text-14` is a size rather
than a colour, files it under colours, and drops it as conflicting the moment a
real colour is merged in the same call:

```
cn("text-14 …", "text-ink-900")   →   "… text-ink-900"     // 14px silently lost
```

No error. The class is simply absent from the output.

**Why it went unnoticed.** It only bites inside `cn()` — plain `className`
strings are unaffected, which is most of the codebase. And the most common step
is `text-16`, where a dropped class is **indistinguishable from a working one**,
because 16px is the inherited default. It surfaced only because `SelectChip`
needed 14px inside a `cn()` alongside a colour, and the audit caught the size.

Registering the group makes a size and a colour coexist, and only two *sizes*
conflict. Verified after the fix: the chip renders 14px / 20px / +0.005em, and
`crModeChoice`, `templateOrCrPicker` and the badge are unchanged.

**Any new step added to `globals.css` must be added to `TYPE_STEPS` in
`lib/cn.ts`.** That pairing is the fragile part and is called out in both files.

---

### D31 — `draftReview`: accordion tiles, two field treatments, literal action tokens
**Status:** settled

**Sections are a two-column grid of accordion tiles** (Figma 59481:7277), not a
modal and not a single list. Collapsed each is a 54px tile; expanded it keeps the
same shell, grows a field list and flips its chevron.

**The two field treatments map exactly onto the contract**, which is a good sign
the two were designed together:

| | Fill | Radius | Value | Trailing icon |
|---|---|---|---|---|
| `editable` | `surface` | 8 | `ink-900` | yes |
| locked | `field-disabled` | 16 | `ink-muted` | **none** |

The missing icon is the point: a locked field offers no affordance to change it,
rather than offering one that quietly does nothing.

**Actions send `option.value` verbatim — never the label.** `cond_edge_b`'s
approval guard is a **substring test**, so labels are actively dangerous:
"Submit for Approval" contains no `approve`, while "I do not approve" contains
one. Verified: clicking the button labelled "Submit" responds `approve`.

The primary gradient is authored at **225.99deg** (59616:13508). `bg-linear-to-r`
on the intake form was an approximation; both now use a shared `bg-btn-primary`
utility with the real angle.

**Reviewing this card needed a better fixture.** The contract example ships one
section with one editable field, which exercises almost nothing. `/dev/cards` now
renders an additional case — locked field with a reason, an empty field, an
empty section, and more sections than fit one row — *alongside* the shipped
fixture, never instead of it, so contract drift stays visible.

---

### D32 — The last three cards, and the registry becomes total
**Status:** settled — closes D9

`submissionResult`, `fieldPrompt` and `featureComingSoon` complete the set.
`REGISTRY` is now typed `TotalRegistry`, so a component added to the contract
without a card here is a **compile error** rather than a runtime placeholder —
which was the plan in D9. `PlaceholderCard` is deleted; the concept no longer
exists.

The host keeps its "no card" branch, because it accepts a registry override and
because that path must still degrade to a stated failure rather than a blank
panel. It now renders the `unknown-component` fallback.

**`submissionResult` disagrees with the agent, once and deliberately.**
`solman_write` can return `success: true` with `cr_id: null`. Telling someone
their change request was created, with no identifier to reconcile against, is
worse than telling them to go and check — they would have nothing to search for
and no reason to look. So a success with no CR ID renders as a **failure**, with
an explicit line about what to do. Verified: the message turns `#d01400` and the
explanation appears.

This is the only place any card overrides what the agent says, and it is here
because the integration doc asks for it in those words.

**`fieldPrompt` sends free text through the same resume channel** the composer
uses, so a card rendered outside the shell (in the gallery, say) is still
answerable.

---

### D33 — A custom dropdown, because the design specifies one
**Status:** settled — corrects an earlier mistake

`cards/Select.tsx`, Figma "Project details" open state (`59527:10623`), with the
Target System and Template ID variants (`59602:11548`, `59556:15791`).

**What was wrong.** The first implementation used a native `<select>` with
`appearance-none`. That hides the arrow but **not the list** — the options popup
is drawn by the operating system, so it ignored the design entirely: wrong
typeface, wrong row height, wrong everything, and different on every platform.
`appearance-none` styles the closed control and creates the impression the whole
thing is handled.

I had also missed that the design *has* an open state; it is a separate frame,
not a variant of the field component set, so it did not appear in the nine
variants I pulled for `Field`.

**What the design actually specifies.** Opening does not float a popover beside
the field — **the field becomes the panel**. Same 16px radius, same 1px border,
same 24px horizontal padding. The value row turns into a header with a bottom
rule and a flipped chevron, and the option list appears beneath.

| | |
|---|---|
| panel | `px-24 py-17`, gap 12, radius 16, border `line` |
| header | `pb-12`, bottom border `line`, label 16 Regular `ink-label` |
| option | `h-32`, label 14 Medium `ink-900`, +0.005em tracking |

Option tracking is the same +0.005em exception as `SelectChip`.

**One deliberate deviation.** The panel is absolutely positioned. In the design
it simply replaces the field, which is fine on a static frame; in a live form it
would shove everything below it down the page on every open.

Verified: 17/17 measured values match, Escape and click-outside close it, and
choosing an option answers the interrupt.

---

### D34 — Make the mock emit the backend's real event sequence
**Status:** settled — **caught a live bug**

The first mock emitted a minimal four-event turn: `RUN_STARTED` → `on_interrupt`
→ `STATE_SNAPSHOT` → `RUN_FINISHED`. Enough to prove the interrupt path, and
quietly not enough to prove anything else.

Re-read `agent.py` and matched what it actually sends:

| scenario | sequence |
|---|---|
| `flow` | RUN_STARTED · STEP_STARTED · CUSTOM · STATE_SNAPSHOT · MESSAGES_SNAPSHOT · STEP_FINISHED · RUN_FINISHED |
| `reconnect` | RUN_STARTED · CUSTOM · RUN_FINISHED — **no snapshot** |
| `delta` | …· STATE_SNAPSHOT · MESSAGES_SNAPSHOT · **STATE_DELTA** ·… |
| `text` | …· TEXT_MESSAGE_START/CONTENT×2/END · CUSTOM ·… |
| `error` | RUN_STARTED · STEP_STARTED · RUN_ERROR |

Two things the old mock got wrong, both of which would have shown up only
against the real backend:

**`STATE_SNAPSHOT` carries the whole `AgentState`** — 22 keys from
`state/state.py`, not `{ ui_component }`. A card that only survives a
single-key snapshot has not been tested.

**`STATE_DELTA` was never exercised at all.** Adding it immediately exposed a
bug: `onStateDeltaEvent` read `agent.state`, which holds the state from
**before** the patch is applied. When the agent sends `ui_component` as a delta
rather than a snapshot, the card silently never appeared — no error, nothing in
the console, just an empty panel.

Fixed by using **`onStateChanged`** for both snapshot and delta: it receives the
merged state, so there is no patching to re-implement and no ordering question.

This is the second bug found by making a test *more* faithful rather than by
adding more assertions to an existing one — the first was `tailwind-merge`
silently dropping type steps (D30).

---

### D35 — The pencil is a real control: edit sends a turn, not a save
**Status:** settled — resolves G23

An editable field's pencil opens an inline editor with two outcomes:
**Update draft** and **Keep original**.

**The payload.** `"${field.label}: ${value}"` — exactly the shape
`_looks_like_field_update_message` accepts (non-empty name before the first
colon, non-empty value after). Newlines are collapsed to spaces so a multi-line
description still arrives as one line. Verified: editing a description produced
`Description of Change: Update the treasury posting rules. Also adjust the
reconciliation job.`

**Why the copy says what it says.** An edit is **this turn's answer**, not a
local mutation — the agent revalidates against the same
`DROPDOWN_FIELDS` / `get_field_metadata` the card was rendered from and presents
the draft again. That is the retry loop. The editor states this in place rather
than implying the change was saved, because a control that looks like a form
field and behaves like a message is exactly the kind of thing people misread.

**One edit at a time.** Opening an editor disables every other pencil. There is
one response channel and one answer per turn; two pending edits could not both
be sent, and offering them would imply otherwise.

**The control follows the contract.** `allowed_values` renders as `SelectChip`s
— the same control the cycle picker uses, so the values SolMan will actually
accept are visible rather than hidden behind a menu. A value over 60 characters
gets a textarea; anything shorter gets an input.

**A correction this exposed.** The icon on an editable field was rendering
`field-info.svg`, a stand-in chosen before that asset had been pulled. The real
asset (`59612:13457`) is a **pencil** — so the design had always specified an
edit affordance, and the stand-in had made the card look read-only by design
rather than by omission.

**Not in Figma:** the expanded editor itself. Built from existing primitives —
`SelectChip`, the field box geometry, and the button treatments from
`draftReview`'s action row — so it reads as native. Logged as G28.

---

### D36 — Retry: ask the agent to write the value again, then choose
**Status:** settled

Fields the agent authored carry a second control beside the pencil. Retry does
not open an editor — it asks for the value to be **written again**, and shows the
result **beside the original** so the user picks.

```
idle  ──retry──▶  loading  ──▶  compare  ──┬── Keep original  → back to idle, nothing sent
                                            ├── Retry again    → loading
                                            └── Use this one   → sends "Label: value"
```

**Why a candidate rather than a replacement.** A regenerated description that
silently overwrote the original would be a change nobody agreed to, on a card
whose entire purpose is approving what will be submitted. So the new value sits
next to the old one, labelled, until someone chooses. When the two come back
identical the card says so and disables the choice, rather than offering a
no-op that looks like a decision.

**Retry is distinguished from edit deliberately.** An edit is the user supplying
text; a retry is the agent supplying it. They answer different needs — "this is
wrong, here is the right text" versus "try again, I don't like this one" — and
both were kept.

**The visual grammar reuses what the design already established:** the original
takes the locked treatment (`field-disabled`, `ink-muted`) because it is not what
is being asked about, and the candidate takes the active one. The control is
`reset.svg`, the exported circular arrow already in use on the intake form.

**Only on fields the agent authored** — `description_of_change` and
`reason_for_change`, both from `generate_cr_fields_from_jira`. Offering it on a
SolMan-supplied field would promise something the agent cannot do.

**Accepting a candidate sends `"Label: value"`**, the same verified path as an
edit (D35), so nothing new is asked of the graph.

Verified end to end: loading state with a `motion-safe` spinner and every other
control disabled; compare showing both values; Keep original restoring the row
with nothing sent; Retry again returning to loading; Use this one sending
`Description of Change: Revised: …` and locking the card.

---

## Gaps

### G1 — CopilotKit does not support headless interrupts for LangGraph/FastAPI
**Status:** **resolved** by D24, 2026-08-24 · **Impact:** was high

Resolved by reading the pinned packages rather than the docs. The decision is to
drop CopilotKit and use `@ag-ui/client` directly — see **D24** for the evidence.

*Original finding below.*

CopilotKit's documentation states plainly that **LangGraph (FastAPI) does not
support Human in the Loop: Headless Interrupts**. Our backend is exactly that
(`add_langgraph_fastapi_endpoint` in `agui_server.py`), and our model is headless
by nature — cards render in our own layout, not inside CopilotKit's chat.

The backend team's working configuration used `useLangGraphInterrupt` with a
`render` callback returning an empty fragment, so the hook delivers the interrupt
while contributing no DOM. That works on the pinned `@copilotkit` 1.67.x, but it
is an unsupported workaround, and CopilotKit v2 marks `useLangGraphInterrupt`
superseded by `useInterrupt`.

**The open question:** retain CopilotKit, or go direct to `@ag-ui/client`'s
`HttpAgent`?

| | CopilotKit | `@ag-ui/client` direct |
|---|---|---|
| Headless interrupts | unsupported for our backend; workaround known to work | first-class: `agent.subscribe({ onRunFinishedEvent })` + `runAgent({ resume })` |
| Proven against this backend | yes, by the backend team | no |
| Extra process | none in Next (route handler) | none |
| Surface we actually use | 3 hooks | the event stream |
| Risk | upgrades may break the workaround | we implement more ourselves |

Mitigated for now by D8 — nothing is bound to either. **To be resolved with a
written recommendation before Step 12.**

**Sources:**
<https://docs.copilotkit.ai/langgraph-fastapi/human-in-the-loop/headless> ·
<https://docs.ag-ui.com/concepts/interrupts>

---

### G2 — Version drift between the backend's pins and current JS SDKs
**Status:** open · **Impact:** medium

| Side | Pinned / current |
|---|---|
| Backend (Python) | `ag-ui-langgraph==0.0.42`, `ag-ui-protocol==0.1.19`, `copilotkit==0.1.94`, `fastapi==0.141.1` |
| JS, current | `@ag-ui/client` **0.0.58**, `@copilotkit/*` **1.69.0** |

The AG-UI interrupt model also moved: current spec carries
`RunFinished.outcome = { type: "interrupt", interrupts: [...] }` with
`id` / `reason` / `responseSchema`, resumed via `RunAgentInput.resume[]`. Whether
the backend's 0.0.42 emits that shape is **unverified** — we have not run it.

**Resolve by:** pinning the JS client to the version line matching the backend's
`0.0.42` for first connection, then upgrading deliberately. Confirm against a
live stream at Step 13.

---

### G3 — The Figma file is barely tokenised
**Status:** accepted, mitigated · **Impact:** low

Two real variables exist; everything else is raw hex on frames. Mitigated by D4.
Consequence: the token file grows per frame rather than arriving complete, and
each addition must cite the frame it came from.

---

### G4 — No Johnson Text Light in the supplied font set
**Status:** open · **Impact:** low

Supplied: Display Light/Regular/Medium/Bold, Text Regular/Medium/Bold. The
platform app has Text Light; we do not.

**Handling:** if a frame calls for Text Light, raise it rather than silently
substituting a nearby weight. Substituting a weight is exactly the kind of
"close enough" that the no-compromise requirement rules out.

---

### G5 — Bulk CR is fully designed but has no contract
**Status:** accepted · **Impact:** medium

Figma section `SolMan CR/CO Agent / Bulk CR` (`59637:15091`) has a complete flow
— CSV upload, file uploaded, info filled, chatbot analysis, proceed, created.
The backend has `BULK_CR_ENABLED = False` and answers a bulk request with the
`featureComingSoon` card. There are no component names or schemas for any Bulk
screen.

**Decision:** build Single CR to spec; Bulk renders `featureComingSoon`. Building
the Bulk screens now would mean inventing a contract the backend has not agreed
to — precisely the coupling the controlled-UI model exists to prevent.

Per the backend's own note, flipping `BULK_CR_ENABLED` is the only change needed
when Bulk ships, and it requires no frontend change.

---

### G6 — GxP compliance fields are not actually locked
**Status:** open, **backend-side** · **Impact:** medium — affects `draftReview`

`COMPLIANCE_LOCKED_FIELDS` holds `standard_change_adtnl`,
`operate_change_adtnl`, `aprv_proc_adtnl`, `release_type_ctx`,
`transaction_type_scope`. It does **not** include GxP Relevant, SOX Impact,
Security Change, RICEF or SoD Ruleset. The five tests asserting those are locked
are `@pytest.mark.skip`-ed as *"pending implementation"*.

**Consequence for us:** those five render in the draft review card as **editable,
with no lock reason** — which is what the config currently says they are. We
render what the contract sends; we do not hard-code a lock the backend has not
declared. Inventing one client-side would make the UI disagree with what actually
gets submitted.

**Flag to the backend team** rather than work around.

---

### G7 — Fabricated CR IDs are filtered at the UI boundary, not fixed at source
**Status:** open, **backend-side** · **Impact:** medium

`node_7` writes placeholder `object_id`s (`CR_0`…`CR_4`) when embedding fails.
`reference_options_from_baseline()` skips any `baseline_crs` slot carrying an
`error`, so they never reach us.

That is a guard, not a fix — the underlying `node_7` behaviour remains. Offering
a fabricated change request to a user as a real one would be a serious defect, so
this is worth tracking even though the mitigation currently holds.

---

### G8 — The shell sits outside the contract
**Status:** accepted · **Impact:** low

The Figma landing screen (agent picker, role selector, breadcrumb, recent
conversations) is platform-app territory, not agent-driven. The contract's own
entry point is `crModeChoice`.

Handled by D12: build it thin, mark it disposable.

---

### G9 — The active-composer treatment is inferred
**Status:** open · **Impact:** low

On the landing frame the composer sits at **opacity 40%** with a grey Send
(`#d1d6dd`). That is the empty-input state. The frame set at this node does not
include an active composer, so the enabled treatment — full opacity, brand-red
Send — is an **inference**, not a read.

It is a reasonable one (grey `#d1d6dd` is the disabled token, brand red is the
only primary action colour in the system), but it is not verified.

**Resolve by:** checking the CR-form frames (`59525:10206` onward), which show a
live composer mid-conversation.

---

### G10 — The persona avatar exported as a stub
**Status:** accepted · **Impact:** none

`avatar.png` came back from Figma as a 64×64, 172-byte file — a placeholder, not
the photo shown on the canvas. It renders as an empty circle at the correct 32px.

Not worth chasing: real avatars come from the platform app's MSAL session, which
we are not implementing (D13). Noted only so nobody mistakes it for a broken
asset pipeline.

---

### G11 — Panel transitions are inferred
**Status:** open · **Impact:** low

Figma shows two static variants per panel. It says nothing about how one becomes
the other — no duration, easing, or whether labels cross-fade.

Implemented as a 200ms ease-out width transition: long enough to read as a state
change, short enough not to feel like an effect. This is an **inference**.

**Resolve by:** asking the designer, or accepting it. Low stakes either way, but
worth not pretending it came from the file.

---

### G12 — The meta timestamp is one string; the design colours it as two
**Status:** open, **needs a backend decision** · **Impact:** low

The design renders the date in `#677489` and the time in `#adb4c1` as separate
runs. The contract sends `meta.timestamp` as a **single pre-formatted display
string** (`"11th Feb, 26  21:12 pm"`).

Splitting it client-side means parsing agent-supplied text to decide
presentation — the same coupling the contract exists to prevent (D11). Rendered
as one string in the date colour.

**Resolve by:** asking the backend team to send `date` and `time` separately if
the two-tone treatment matters. Additive, so `CONTRACT_VERSION` would not need
to move.

---

### G13 — The radio's selected state is inferred
**Status:** **resolved** via D21, 2026-08-24 · **Impact:** none

Pulled the full component set once REST access was in place. All three variants
are now implemented from the design rather than inferred:

| Variant | Ring | Fill / centre |
|---|---|---|
| `default` | `#4a5567` (`ink-600`) 1.5 | — |
| `Hover` | `rgba(235,23,0,0.52)` (`brand-a52`) 1.5 | `rgba(235,23,0,0.12)` (`brand-a12`) |
| `Clicked` | `#eb1700` (`brand`) 1.5 | 8×8 centre in `brand` |

The inferred selected treatment turned out to be correct. Two things it missed:
a **hover state** that did not exist in the implementation at all, and a centre
dot authored at 8/24 units — 5.33px at render, where the inference had used 6px.

The two brand alphas are used by both the radio and the agent avatar ring, so
they are now named tokens (`brand-a12`, `brand-a52`) rather than repeated
literals.

*Original finding below.*

Figma exports only `Property 1=default` (unselected): a 24-unit box with a
circle from 2 to 22, 1.5-unit stroke in `#4A5567`. The **selected** variant could
not be pulled before the MCP call limit hit (G14).

Implemented as brand ring plus filled brand centre — the only primary colour in
the system — with the exported geometry reproduced exactly. Both states are drawn
in CSS rather than one asset and one hand-drawn state, which would have put two
different renderings of the same control side by side. This is a deliberate,
scoped exception to D14.

**Resolve by:** pulling `57719:9310`'s selected variant when calls are available.

---

### G14 — Figma MCP call limit reached (Starter plan)
**Status:** **mitigated** — superseded by D21, pending a token · **Impact:** was blocking

**Resolution:** move design extraction off the MCP server and onto the Figma REST
API (**D21**). That worked and paid for itself immediately — it confirmed the
`crModeChoice` values independently and closed G13 with two corrections.

**Update, same day: the REST quota is now exhausted too.**
`x-figma-rate-limit-type: low`, `Retry-After: 398971` — **resets
2026-08-29T08:14Z**. Deep `--depth 5` pulls against a ~14,000-node file are
expensive, and a handful of them spent the free-tier allowance.

Two fixes so this cannot recur:

- **Fail fast.** The script now refuses to sleep past 120s and reports the real
  reset time instead. Left as written it would have slept for 4.6 days.
- **Cache to disk.** Every node response is now cached under
  `_ref/figma/cache/`, so re-reading a node costs nothing and the values behind
  any decision stay checkable offline. Pass `--fresh` to bypass.

**What was extracted before it ran out** — enough to finish this step and most of
the next: the full field component set (all nine variants), the radio set, the
card shell, `crModeChoice`, `crIntakeForm`'s complete structure, and the shell.
Still missing: five icons (G16) and the styling for the five remaining cards.

*Original finding below.*

The account hit its Figma MCP tool-call limit partway through this step. No
further `get_design_context`, `get_metadata`, `get_screenshot` or
`get_variable_defs` calls will succeed until it resets or the plan is upgraded.

**What this blocks.** Seven cards remain, and each needs its frame pulled for
exact values. Two specific items are already outstanding: the radio selected
variant (G13) and the user-message bubble, for which only geometry from an
earlier metadata dump exists — no colours, radii, or type.

**What it does not block.** Everything already extracted is saved:
`_ref/figma/figma-tree.xml`, the downloaded frame screenshots, 31 committed
icon assets, and the token file. The contract layer, the shell, and this card
are complete and reviewable.

**Resolve by:** upgrading the Figma plan, waiting for the limit to reset, or —
if neither is quick — the designer exporting the remaining frames. Flagged early
because it determines whether the next step can start.

---

### G15 — The mode labels and their order differ between design and contract
**Status:** **resolved** — confirmed by the product owner, 2026-08-24 · **Impact:** none

> "All wording is as per backend data — frontend only renders, backend drives."

Rendering the agent's `label`, `description` and ordering verbatim is correct and
is the standing rule for **every** card: no card hard-codes copy from a Figma
frame. Where design text and contract text disagree, the contract wins and the
change belongs in `ui_contract.py`.

Kept here because the discrepancy is still visible when comparing a card against
its frame, and the next person to notice it should find the answer rather than
re-open it.

*Original finding below.*

| | Design (59646:14752) | Contract (`cr_mode_choice`) |
|---|---|---|
| First option | **Project** *(Bulk Change Requests)* | Single Change Request |
| Second option | **Operations** *(Single Change Requests)* | Bulk Change Request |
| Description | short parenthetical | a full sentence |

We render the agent's `label` and `description` in the agent's order, because
that is what the controlled-UI model requires — the card is a renderer, not an
author. Hard-coding the design's wording would mean the screen stops reflecting
what the agent actually offers.

Consequence today: the card reads "Single Change Request — Raise one change
request against a platform and target system." rather than "Operations (Single
Change Requests)". Visually correct, textually different.

**Resolve by:** whoever owns the wording. If the design's phrasing is the
intended product copy, the change belongs in `ui_contract.cr_mode_choice`, where
it is one edit and needs no frontend change.

---

### G16 — Five field icons not yet exported
**Status:** **resolved** 2026-08-24 · **Impact:** none

All five exported via the REST API on the duplicated file, in a single request.
Their baked-in strokes match the tokens exactly — `field-error` `#D01400` =
`error`, `field-verified` `#0B7929` = `success`, `field-info` `#4A5567` =
`ink-600`, `reset` `#EB1700` = `brand`. `Field` now derives its own trailing icon
from state, so cards no longer pass one.

*Original finding below.*

The Figma quota ran out (G14 update) before these could be exported:

| Asset | Figma node | Used by |
|---|---|---|
| Reset (circular arrow, 20px, brand stroke) | `59527:10515` | `crIntakeForm` header |
| Field dropdown chevron, 16px | `59498:12032` | Platform, Target System |
| Field error indicator, 16px | `59500:14389` | `error` state |
| Field verified tick, 16px | `59500:14411` | `verified` state |
| Field info, 16px | `57410:88206` | `default` state |

**Interim handling.** The dropdowns reuse `chevron-role.svg` — a 16px down-chevron
from the same design system (the role selector), very likely the same component,
but not verified. "Reset Form" renders as **text only**: no icon is better than a
lookalike, and it is obvious at review that something is missing.

**Resolve by:** exporting these five from Figma (select layer → Export → SVG),
which needs no API quota at all, or re-running `npm run figma -- <id> --svg`
after 29 Aug.

---

### G17 — "Cancel" has no meaning in the contract
**Status:** open, **needs a backend decision** · **Impact:** low

The design puts Cancel next to Submit on the intake form. But `node_0_wait`
routes *any* response from `crIntakeForm` straight to `node_1` — there is no
value that means "abandon this turn", and the graph is blocked on a single
`interrupt()` that must be answered.

So Cancel cannot cancel anything server-side. It currently **clears the form
locally**, which is the only honest behaviour available: it does something
visible, and it does not lie about aborting the agent.

**Resolve by:** deciding what Cancel is for. If it should abandon the CR, the
graph needs a branch for it. If it is just "clear what I typed", it duplicates
Reset Form and one of the two should go.

---

### G19 — `cycleIdPicker` cannot be built exactly without Figma access
**Status:** **resolved** 2026-08-25 · **Impact:** none

Unblocked by re-authorising the Figma MCP connector to the second account, which
carries its own team and therefore its own MCP quota. The "Platform Selection"
component set (`59463:12746`) turned out to have three variants, all now
implemented — see D29.

*Original finding below.*

The card is `59568:10257` (804×238). Its structure is known from the offline
tree: an agent message, then the cycle options as **180×36 chips in a
four-per-row grid** — an instance of a component named **"Platform Selection"**
(`59463:12746`), *not* the 421×39 `OptionRow` used by `templateOrCrPicker`.

That component has never been pulled, is not in the cache, and the REST quota is
spent until **29 Aug 09:04 UTC**. So its fill, border, radius, radio treatment and
type are unknown.

**Not built rather than guessed.** Every other card was measured; inventing this
one would put an unmarked inference into a set that is otherwise exact, and it
would not be obvious later which was which.

**Resolve by** any of: a screenshot of `59568:10257`; exporting that node; a
token from an account with quota; or waiting for the reset.

**Also worth noting:** the card is **804px wide**, not 905. The card shell is
content-sized, not fixed — `CardShell` already behaves this way, but the
assumption that every card is 905 would have been wrong.

---

### G20 — `draft_cycle_id` / `keep_current_label` have no design frame
**Status:** open · **Impact:** low

`cycleIdPicker` carries both props, and the design set has no frame showing a
"keep the current cycle" affordance.

Implemented as an additional leading chip, rendered **only when the agent sends
both**. When it sends neither, nothing appears — so an unused contract feature
costs nothing visually, and a used one is at least reachable.

**Resolve by** asking whether that path is real. If it is, it needs a frame; if
it is not, the two props could come out of the contract.

---

### G21 — No `filled/total` counts or Expand-all in the design
**Status:** open · **Impact:** low

`AGUI_INTEGRATION.md` states: "Sections show a `filled/total` count so a user can
see at a glance where values are missing without opening everything, and there is
an Expand all / Collapse all toggle."

The design has **neither**. Section tiles show a name and a chevron.

Built as designed. The contract does supply what a count would need (`empty` per
field), so this is additive whenever the design catches up — but inventing UI the
design does not have would be the same mistake in the opposite direction from
inventing values.

**Resolve by** asking whether the doc or the design is ahead.

---

### G22 — `lock_reason` has no slot in the design
**Status:** open, **rendered anyway** · **Impact:** low

The contract carries `lock_reason` and the integration doc is emphatic: "A field
that silently refuses to change reads as a bug; a stated reason makes it a
visible control." On a regulated approval path that is the right instinct.

The design's field treatment has nowhere to put it. It is rendered as a 10px
`ink-450` line beneath the field — **a deliberate addition, not a measured
value**, and the only place a card renders something the design does not show.

**Resolve by** getting a designed treatment, or confirming this one.

---

### G23 — The contract defines no way to submit a field edit
**Status:** **resolved** by D35, 2026-08-26 · **Impact:** none

The premise was wrong. There is no *action* for an edit, but there is a
**channel**: `node_9_hitl_wait` runs every reply through
`_looks_like_field_update_message` and routes anything shaped
`"Field Name: value"` to `cond_edge_b` for update parsing rather than approval
routing. The design also had the affordance all along — the icon on an editable
field is a **pencil**, which an earlier stand-in had obscured.

*Original finding below.*

`node_10` validates edits against `DROPDOWN_FIELDS` and `get_field_metadata`, and
the contract sends `editable`, `field_type` and `allowed_values` per field — all
of which imply editing.

But `draftReview.actions` carries only approve/reject-style values. There is **no
action, and no prop, for submitting a changed field**.

So this card renders fields **read-only**. The editable/locked treatment is an
accurate *description of what the agent will accept*, not a control. Edits
presumably go through the composer as free text, which `node_10` then validates —
consistent with `fieldPrompt` existing for generic asks.

**Resolve by** confirming the intended edit path. If fields are meant to be
edited in place, the contract needs an action for it; if not, `allowed_values`
is documentation rather than a control, which is worth stating.

---

### G24 — The failed `submissionResult` treatment is inferred
**Status:** open · **Impact:** low

Figma `59575:11901` shows only the **success** case: one message line, no icon,
no status colour. There is no frame for `status: "failed"`.

Implemented as the message in `error` — the established semantic token — with no
icon, keeping the design's restraint. Inferred, not measured.

---

### G25 — `fieldPrompt` has no dedicated frame
**Status:** open, **mapped rather than invented** · **Impact:** low

It is the agent's generic ask (`node_3_request_information`), so it is not a
screen anyone drew.

Built on the `crModeChoice` frame (`59646:14750`), which is the designed instance
of exactly this shape — a message, then a radio list, in the standard shell. The
free-text input reuses the `Field` input treatment.

Reasonable, and still a mapping rather than a measurement. Worth a designer's
eye if this card turns out to be common.

---

### G26 — `featureComingSoon` has no frame at all
**Status:** open · **Impact:** low

The design set contains a **complete Bulk CR flow** (`59637:15091`) — it was
drawn for the world where Bulk shipped, so a coming-soon screen never existed.

Assembled from established parts: the standard shell, the standard message
treatment, and the secondary button from `draftReview`'s action row.

Note this card is only reachable because the mode choice stays clickable (D19).
If Bulk ships, `BULK_CR_ENABLED = True` is the only change needed and this card
simply stops appearing — no frontend work either way.

---

### G27 — The design's `capitalize` is wrong for agent prose
**Status:** **resolved** 2026-08-26 · **Impact:** was visible

The field-value treatment carries `capitalize` in Figma, and the design's own
sample values are short — "Information", "Low", "In Development" — where it is
harmless.

Applied to a real description the agent wrote, it title-cases every word:

> Update **The** Treasury Posting Rule Set **So** Month-End Accruals Post **To
> The** Correct GL Account…

Removed from field values and from the dropdown's selected value. Kept on labels
and section names, which are short identifiers where the design's intent holds.

The general rule this follows is the standing one (G15): **copy is the backend's;
the frontend renders it as sent.** A CSS transform that rewrites agent text is
the same violation as hard-coding a label, just less obvious.

---

### G28 — The field editor has no Figma frame
**Status:** open · **Impact:** low

The design specifies the pencil but not what opens. The editor is assembled from
existing primitives — `SelectChip` for `allowed_values`, the field box geometry,
and the small button treatments from `draftReview`'s action row — with a
`brand-a52` border marking the field under edit and `brand-a24` on its section.

**Resolve by** getting a designed treatment, or confirming this one.

---

### G29 — The regenerate call is a stub
**Status:** open · **Impact:** medium — **the feature is UI-only until the backend lands**

There is no regenerate action in the contract, and unlike a field edit — which
`node_9` accepts as `"Field Name: value"` — there is no reply shape that means
"produce this again".

`cards/regenerateField.ts` therefore returns a locally-composed alternative after
a short delay, so the states can be built and demonstrated. It logs a console
notice in dev, and **the whole of the real implementation is the body of one
function**; the card awaits a promise of a string and does not care where it came
from.

**Resolve by** adding a regenerate path to the graph. Then replace that body and
delete `draftAlternative`. Nothing else changes.

---

### G30 — The contract cannot say which fields are regenerable
**Status:** open, **needs a backend decision** · **Impact:** low

Nothing in `FieldRow` distinguishes a value the agent wrote from one SolMan
supplied, so `REGENERABLE_KEYS` in `regenerateField.ts` is a hard-coded list of
two contract keys.

That is exactly the kind of client-side inference the contract exists to remove —
it would silently miss a third generated field, or offer retry on a field the
agent cannot regenerate.

**Resolve by** adding `regenerable: true` to `FieldRow`, alongside the existing
`editable` and `lock_type`. Additive, so `CONTRACT_VERSION` would not move, and
the hard-coded list disappears.

---

## Change log

| Date | Entry |
|---|---|
| 2026-08-24 | D1–D13, G1–G8 recorded. Steps 0–2 complete: layout, foundation, contract layer. |
| 2026-08-24 | D14–D15, G9–G10 recorded. Step 3 complete: app shell, 32/32 measured values matching Figma. |
| 2026-08-24 | D16 (scope boundary) and D17 (proportional scaling) recorded after review feedback on apparent zoom at 1280×720. |
| 2026-08-24 | D18 and G11 recorded. Shell interactions complete: both nav panels collapse/expand per their Figma variants. |
| 2026-08-24 | D19–D20, G12–G15 recorded. Step 4 complete: CardShell + crModeChoice, 1/8 cards. Figma MCP call limit reached (G14). |
| 2026-08-24 | G15 resolved (backend drives all copy). D21 added: design extraction moved to the Figma REST API, mitigating G14. |
| 2026-08-24 | Figma REST access live. G13 resolved: radio default/hover/clicked now from the design, not inferred. |
| 2026-08-24 | D22–D23, G16–G17 recorded. Step 5 complete: crIntakeForm + Field + useJiraLookup, 2/8 cards. REST quota exhausted; resets 29 Aug. |
| 2026-08-24 | **G1 resolved.** D24: drop CopilotKit, connect via @ag-ui/client directly. Interrupts arrive as CUSTOM `on_interrupt`; resume via forwardedProps.command.resume. |
| 2026-08-24 | New Figma token (duplicated file). G16 resolved: all five icons exported and wired. D25 added: check layer visibility. |
| 2026-08-24 | Transport implemented (D24): useAgentSession + /api/agent proxy + scripted mock. Full resume cycle, reconnect and error verified; D7 proven empirically. |
| 2026-08-24 | D26–D27. Step 6: templateOrCrPicker + DetailsModal + OptionRow, 3/8 cards. Figma REST quota spent again; cache now searches by node id so remaining work continues offline. |
| 2026-08-25 | D28: demo wired end-to-end in the real shell. G19: cycleIdPicker blocked on the "Platform Selection" chip — not cached, quota spent. |
| 2026-08-25 | Figma MCP re-authorised to the second account — fresh quota. G19 resolved. D29 (cycleIdPicker), D30 (tailwind-merge type-step fix), G20. 4/8 cards. |
| 2026-08-25 | D31 (draftReview), G21–G23. 5/8 cards. Primary gradient corrected to the designed 225.99deg in both places. |
| 2026-08-25 | **All 8 cards complete.** D32 + G24–G26. Registry now total (D9 closed); PlaceholderCard deleted. |
| 2026-08-25 | D33: replaced the native select with the designed dropdown panel (59527:10623). Reported by review — the OS-drawn list ignored the design. |
| 2026-08-25 | D34: mock now emits the real event sequence (steps, full 22-key snapshots, messages snapshots, deltas, streamed text). Caught and fixed a STATE_DELTA bug in useAgentSession. |
| 2026-08-26 | D35: draft-review field editing (Update draft / Keep original), resolving G23. G27 (capitalize on agent prose) fixed. G28 logged. Meta strip gap fixed on narrow cards. |
| 2026-08-26 | D36: retry on agent-authored fields — loading → compare → keep/use. G29 (stub) and G30 (no regenerable flag) logged. |
