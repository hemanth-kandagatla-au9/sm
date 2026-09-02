# CR/CO Agent — frontend

A frontend for the SolMan **Change Request / Change Order** agent: a LangGraph
graph that walks a user through raising a change request, pausing at every step
to ask a human something.

---

## The one idea everything follows

**The agent never ships UI.** It names one of eight registered React components
and supplies JSON props. Anything not in the registry cannot render.

```
agent  ──▶  { version: 1, name: "draftReview", props: { … } }  ──▶  <DraftReview />
```

This is the **controlled-UI contract**, and it is what makes an LLM-driven
interface safe to put in front of an enterprise user. The failure mode it removes
is the important one: a model that can emit markup can emit *any* markup. Here
the model's whole vocabulary is eight names and a typed props object, both
validated at the boundary. The worst a confused or compromised agent can do is
name a component that does not exist — which renders a visible fallback card
explaining the problem, not an exploit.

Everything in `docs/WHY.md` either serves that idea or protects it.

---

## Quick start

```bash
nvm use                        # 22.19.0 — see .nvmrc
npm install
cp .env.example .env.local
npm run dev                    # http://localhost:3000
```

That runs against the **scripted backend** — no Python, no SolMan, no network.
The conversation is real; only the graph is simulated.

To talk to the real agent, set `NEXT_PUBLIC_AGENT_PATH=/api/agent` in
`.env.local`, fill in the AgentCore and Azure values below, and restart.

There is no local backend process to start: the agent runs on **AWS Bedrock
AgentCore**, and this app calls its data-plane endpoint directly. There is no
CopilotKit bridge either — it speaks AG-UI natively.

### Environment

| Variable | Purpose |
|---|---|
| `AGENTCORE_RUNTIME_ENDPOINT_ARN` | The combined runtime + endpoint ARN. The region and qualifier are parsed out of it. Server-only. |
| `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET` | Client-credentials config for the bearer token the runtime's JWT authorizer expects. **Server-only, and the secret is a real secret.** |
| `AZURE_TOKEN_SCOPE` | Optional. Defaults to `api://<client id>/.default`. |
| `NEXT_PUBLIC_AGENT_PATH` | Where the browser posts. Defaults to the same-origin proxy `/api/agent`. |
| `NEXT_PUBLIC_AGUI_AGENT_NAME` | The agent's registered name. |
| `APP_VERSION`, `GIT_SHA` | Build identity, reported by `/api/health`. Set by the pipeline. |
| `AGUI_API_BASE` | `npm run contract:pull` only. Not used by the running app. |

**A variable prefixed `NEXT_PUBLIC_` is compiled into the JavaScript bundle and
is readable by anyone with the page open.** Backend hosts therefore carry no
prefix and are read only in server code — the browser is told a same-origin path
and never learns where the backend lives.

The build requires **no** environment at all; configuration is validated at
process start instead. A misconfigured **production** deployment fails at boot,
loudly. In development it warns and lists what is missing, because the scripted
backend needs no AWS or Azure configuration and nobody should need a production
client secret to look at a card.

---

## Scripts

| Command | |
|---|---|
| `npm run dev` | development server |
| `npm run build` | production build |
| `npm start` | serve the production build |
| `npm test` | Vitest, 96 tests |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | `eslint --max-warnings 0` |
| `npm run check:tokens` | asserts `globals.css` and `cn.ts` agree on type steps |
| `npm run check:contract` | asserts the generated types still match `ui-contract.json` |
| `npm run contract:pull` | refresh the contract snapshot (needs a local `agui_server.py` — see GAPS G18) |
| `npm run contract:gen` | regenerate types + fixtures from the snapshot |
| **`npm run verify`** | **every gate, in the order CI should run them** |

**A change is not finished until `npm run verify` is green.** That is the whole
pipeline in one word, so a developer can reproduce its verdict before pushing.

### For whoever writes the pipeline

CI belongs to DevOps (this repo carries no runner config — the org uses Jenkins
via `jpm_shared_lib`). The whole gate is four lines:

```bash
npm ci                            # exactly the lockfile, fails if it disagrees
npm audit --audit-level=high      # see "Framework version" in docs/WHY.md
npm run verify                    # types, lint, consistency checks, tests, build
```

Run the build step **with no environment supplied** — that is what catches
anyone reintroducing a module-scope read of a backend URL.

---

## Architecture

```
        browser                 Next server                AWS Bedrock AgentCore
  ┌───────────────────┐   ┌────────────────────┐      ┌───────────────────────┐
  │ shell             │   │ /api/agent  ───────┼─SSE─▶│ POST /invocations     │
  │  └ Transcript     │◀──┤   + bearer token   │      │   LangGraph, SolMan   │
  │      └ cards      │   │ /api/health,/ready │      │   Jira                │
  └───────────────────┘   └─────────┬──────────┘      └───────────────────────┘
        same origin only            │ client credentials
                                    ▼
                          ┌────────────────────┐
                          │ Azure AD (token)   │
                          └────────────────────┘
```

The browser talks to **one origin**. Every backend call goes through the Next
server, which is what lets the Content-Security-Policy say `connect-src 'self'`
— an injected script has no destination to exfiltrate a draft CR to.

### Layers

```
src/agent-ui/   the contract layer — portable, no app imports. THE DELIVERABLE
src/cards/      the eight cards and their primitives — props in, respond() out
src/ui/         presentational leaves: Icon, Tooltip, UserTurn
src/shell/      the designed chrome — rail, sidebar, headers, composer, transcript
src/lib/        env, logger, cn
src/app/api/    the only egress. The browser never learns the runtime or the token
```

Import direction is one-way, and **enforced by ESLint rather than convention**:

```
shell → cards → agent-ui → contract
  ↘      ↓
     ui / lib          (leaves: they import nothing local)
```

`agent-ui/` is the portable half — it imports nothing from this app and can be
moved into another host as a folder. `cards/` are pure: props in, `respond()`
out, no fetching, no routing, no store. Written as a convention this would rot in
a fortnight; written as a lint rule it fails the build. It has already caught one
real coupling.

### How a turn works

1. The graph blocks on `interrupt(ui)` and emits a **`CUSTOM` event named
   `on_interrupt`** carrying the envelope, **JSON-encoded as a string**.
2. `useAgentSession` — the only file that knows about AG-UI — hands it to
   `resolveEnvelope`, which validates it and decides between the interrupt and
   the agent's state.
3. `AgentComponentHost` looks the name up in the registry and renders the card.
   **It never inspects props to work out which screen this is.**
4. The card calls `respond(value, label)`. The value routes; the label is what
   the transcript shows.
5. The session resumes the graph via **`forwardedProps.command.resume`**.

Three of those are non-obvious and cost days if missed — all are documented at
the top of `src/agent-ui/useAgentSession.ts`, with the evidence. The third, the
JSON-encoded interrupt, is the one that fails silently *and* invisibly: a mock
that follows the protocol sends the object, so development works perfectly while
every card in production renders a fallback.

### The registry is total

All eight contract components are implemented, and `REGISTRY` is typed
`TotalRegistry`. **A ninth component added to the contract without a card here is
a compile error**, not a silent fallback. If the backend plans a new component,
we need the contract change and the card in the same release.

### The transcript

The conversation is the frontend's own record: the agent holds only the *latest*
card in state, so there is no history to ask for. Turns are kept in an external
store backed by `sessionStorage`, per thread — a refresh restores the
conversation; a different device does not. See `docs/GAPS.md` G15.

---

## Development surfaces

All four **return 404 in a production build** — the markup is never produced.

| | |
|---|---|
| `/dev/tokens` | the design system rendered: colour, type, radii, elevation |
| `/dev/primitives` | every shared component in every designed state, including the ones a happy path never reaches |
| `/dev/cards` | all eight cards from the backend's own fixtures, plus five injected failure paths, plus a full-payload `draftReview` |
| `/dev/session` | the whole transport driven against the scripted backend, with a scenario picker |

`/api/agent/mock` serves the **real** AG-UI SSE wire format — `HttpAgent`, its
parser and every subscriber path are exercised exactly as against Python. Five
scenarios: `flow`, `reconnect`, `delta`, `text`, `error`. It carries the same
production guard: a route that fabricates approval screens must not exist in a
production build.

---

## Keeping the contract in sync

The snapshot is committed, so cards build and test with no backend running.
Refresh it deliberately:

```bash
npm run contract:pull    # GET /api/ui-contract from a running agui_server.py
npm run contract:gen     # regenerate types + fixtures
npm run verify           # a real prop change now fails here, not in QA
```

Never edit a `.generated.ts` file by hand — `check:contract` regenerates and
compares byte for byte.

---

## Documentation

| | |
|---|---|
| **`docs/WHY.md`** | Why every decision is what it is, step by step, written as each was taken — including what each one cost and the mistakes found on the way. Start here before changing anything structural. |
| **`docs/GAPS.md`** | What is knowingly incomplete, and **who can close it**. Most are not ours. |

The rule those two files enforce: **a gap is written down and walked past, never
quietly worked around.** A workaround nobody recorded becomes the design a year
later.

### Things worth knowing before you change them

- **Bulk stays clickable** even though the contract sends `enabled: false`.
  `node_0_wait` routes on `mode == "bulk"` without reading `enabled` and answers
  with the `featureComingSoon` card. Disabling it would make a designed screen
  unreachable.
- **Draft actions send literal tokens** — `approve`, `reject` — never labels.
  The approval guard is a substring test: "Submit for Approval" contains no
  `approve`, and "I do not approve" contains one.
- **A pending interrupt outranks agent state.** On reconnect the backend re-sends
  the interrupt and **no** state snapshot, so state is stale by design.
- **Success with no CR id renders as a failure.** Telling someone their request
  was created with no identifier to reconcile against is worse than telling them
  to check.
- **If the route table shows `○` for a page, the nonce is not reaching it.** A
  statically prerendered page has no request to take a CSP nonce from, so its
  scripts are blocked in production and it renders blank — while working
  perfectly in development.

---

## Build log

| Step | State |
|---|---|
| 0 — Toolchain | ✅ `next@16.3.3`, 0 advisories |
| 1 — Env validation, agent proxy, health, CSP | ✅ verified on the wire |
| 2 — Design tokens and fonts | ✅ |
| 3 — Contract layer + codegen | ✅ |
| 4 — Card primitives | ✅ |
| 5 — Cards 1–4 + lookup proxy | ✅ |
| 6 — Cards 5–8 | ✅ registry total |
| 7 — AG-UI transport + transcript | ✅ |
| 8 — Shell, per the Figma spec | ✅ |
| 9 — Tests, observability | ✅ |
| 10 — AgentCore transport, Azure AD token | ✅ 96 tests |
| Container, pipeline, deployment | owned by DevOps |
