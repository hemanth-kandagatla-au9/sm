# CR/CO Agent Frontend

A frontend for the SolMan CR/CO LangGraph agent, built on the **controlled-UI**
contract: the agent never ships UI — it names one of eight registered React
components and supplies JSON props. Anything not in the registry cannot render.

All eight contract components are implemented.

---

## Run it

```bash
npm install
cp .env.example .env.local     # point AGUI_BACKEND_URL at agui_server.py
npm run dev                    # http://localhost:3000
```

Then start the agent host:

```bash
. ./set_env.ps1 ; python agui_server.py     # Windows
source set_env.sh && python agui_server.py  # Linux / macOS
```

Two processes, not three. The CopilotKit runtime bridge that used to sit on :8006
is gone — this app speaks AG-UI directly.

| Variable | Purpose |
|---|---|
| `AGUI_BACKEND_URL` | Where `agui_server.py` is reachable **from the Next server**. Default `http://localhost:8084/copilotkit`. Server-side only. |
| `NEXT_PUBLIC_AGENT_URL` | Where the browser sends agent traffic. Defaults to the same-origin proxy at `/api/agent`. |
| `NEXT_PUBLIC_AGUI_API_BASE` | Base for the REST helpers — platforms, target systems, Jira lookup. Default `http://localhost:8084`. |

---

## Two protocol details that will cost you a day if you miss them

Both were found by reading `ag-ui-langgraph==0.0.42`, which is what
`agui_server.py` pins. **The current AG-UI documentation describes a newer
protocol** and following it fails silently in both cases.

### 1. Interrupts arrive as a CUSTOM event, not `RunFinished.outcome`

```python
CustomEvent(type=EventType.CUSTOM, name="on_interrupt", value=<the envelope>)
...
RunFinishedEvent(type=EventType.RUN_FINISHED, thread_id=..., run_id=...)
```

`RunFinishedEvent` is constructed with **no `outcome` field**, so
`agent.pendingInterrupts` and the `outcome: "interrupt"` branch never fire. The
`ui_component` envelope is `event.value`.

### 2. Resume travels in `forwardedProps`, not `resume`

`ag-ui-protocol==0.1.19` *does* define `resume: List[ResumeEntry]` on
`RunAgentInput`, and `@ag-ui/client` *does* expose `runAgent({ resume })`.
**`agent.py` never reads it.** It reads `forwarded_props["command"]["resume"]`.

Sending `resume` is accepted by Pydantic, returns no error, and the graph simply
never wakes up. There is nothing in any log to explain it.

```ts
agent.runAgent({ forwardedProps: { command: { resume: value } } });
```

Both live in `src/agent-ui/useAgentSession.ts`, commented at the point of use.

---

## Layout

```
src/agent-ui/     The contract layer. Portable — no app imports.
  ui-contract.json          verbatim snapshot of the backend's contract document
  contract.generated.ts     generated props types + component names
  fixtures.generated.ts     the backend's own example payload per component
  resolveEnvelope.ts        validation + interrupt-vs-state precedence
  registry.tsx              name → component. Total: a missing card fails to compile
  AgentComponentHost.tsx    looks the component up and renders it
  useAgentSession.ts        the transport — the only file that knows about AG-UI
  FallbackCard.tsx          every failure mode degrades to a visible card

src/cards/        The eight cards. Props in, respond() out. No fetching, no routing.
src/shell/        Rail, sidebar, headers, composer. Disposable — see below.
src/app/api/agent Same-origin proxy to agui_server.py.
```

**`src/shell/` is disposable.** It reproduces the platform team's own chrome so
the flow can be demonstrated in context. When this merges into the platform app,
delete it and render `<AgentComponentHost>` inside their chat surface instead.

**`src/agent-ui/` is the deliverable.** It imports nothing from the app and can
be moved as a folder.

---

## Keeping the contract in sync

The contract snapshot is committed, so cards build and test with no backend
running. Refresh it deliberately:

```bash
npm run contract:pull    # GET /api/ui-contract from a running agui_server.py
npm run contract:gen     # regenerate types + fixtures
npm run typecheck        # a real prop change now fails here, not in QA
```

`assertRegistryMatchesContract()` also logs drift in the browser console at
startup — a component the agent can emit that this app cannot render, or the
reverse.

---

## Behaviour worth knowing before you change it

**Bulk stays clickable** even though `crModeChoice` sends `enabled: false` for it.
`node_0_wait` routes on `mode == "bulk"` and never reads `enabled`, answering with
the `featureComingSoon` card. Disabling it client-side would make that designed
screen unreachable. Flipping `BULK_CR_ENABLED` needs no frontend change.

**Draft actions send literal tokens** — `approve`, `reject` — never their labels.
`cond_edge_b`'s approval guard is a substring test, so "Submit for Approval"
contains no `approve` while "I do not approve" contains one.

**A pending interrupt outranks agent state.** On reconnect, `agent.py` emits
`RUN_STARTED → on_interrupt → RUN_FINISHED` and **no state snapshot**, so
`ui_component` is stale. `resolveEnvelope` reads the interrupt first.

**Success with no CR ID renders as a failure.** `solman_write` can return
`success: true` with `cr_id: null`; telling someone their CR was created with no
identifier to reconcile against is worse than telling them to check.

**Jira lookup**: 600 ms after the last keystroke or immediately on blur, only for
a key matching `^[A-Za-z][A-Za-z0-9]+-\d+$`, sequence-numbered so a slow response
for an old key cannot overwrite a newer one, and it never overwrites text the
user typed themselves.

---

## Open questions for the backend team

These are places the contract cannot currently express something the UI needs.
Full context in `DECISIONS.md`.

| | |
|---|---|
| **G23** | No action or prop for submitting a **field edit**. `node_10` validates edits and the contract sends `editable` / `allowed_values`, but `draftReview.actions` only carries approve/reject. Fields are rendered read-only. |
| **G17** | What should **Cancel** on the intake form do? Any response routes to `node_1`; there is no "abandon" value. It currently clears the form locally. |
| **G6** | `COMPLIANCE_LOCKED_FIELDS` omits the GxP fields, so GxP Relevant, SOX Impact, Security Change, RICEF and SoD Ruleset render **editable with no lock reason**. |
| **G7** | `node_7` writes fabricated `object_id`s on embedding failure. Filtered at the UI boundary, but the behaviour remains. |
| **G12** | `meta.timestamp` is one string; the design colours date and time differently. Sending `date` and `time` separately would be additive. |
| **G20** | `draft_cycle_id` / `keep_current_label` have no designed treatment. Is that path real? |
| — | The intake form's **Reset / Cancel / Submit** labels are taken from the design because the contract has no props for them. |
| — | `draftReview` infers which action is destructive from a regex on its value. A `tone` field on actions — as `DetailRow` already has — would remove the guess. |

---

## This tree is generated

It is produced from the development app by `npm run export:prod`, which strips
the `/dev` routes, the scripted backend, the Figma tooling and `.env.local`.

**Edits made here are overwritten on the next export.** Changes belong upstream.
