# Why this codebase is built the way it is

A living document. One section per build step, written **as the step is taken**,
never afterwards. Each entry answers three questions: what was chosen, what it
buys, and what it costs.

If you are reviewing this repo and something looks unusual, it should be
explained here. If it is not, that is a defect in this document.

---

## The one idea everything else follows

The agent never ships UI. It names one of eight registered React components and
supplies JSON props. Anything not in the registry cannot render.

This is the **controlled-UI contract**, and it is what makes an LLM-driven
interface safe to put in front of an enterprise user. The failure mode it
removes is the important one: a model that can emit markup can emit *any*
markup. Here the model's entire vocabulary is eight names and a typed props
object, both validated at the boundary. The worst a compromised or confused
agent can do is name a component that does not exist — which renders a visible
fallback card, not an exploit.

Every structural decision below serves that idea or protects it.

---

## Step 0 — Toolchain

**Goal:** a repository where the three gates — types, lint, build — are green,
and produce the same result on a second machine.

Nothing else. No cards, no transport, no design tokens. A step ends green or it
does not end.

### Why scaffold with `create-next-app` rather than assembling by hand

```bash
npx --yes create-next-app@16.1.6 real_frontend \
  --ts --tailwind --eslint --app --src-dir --import-alias "@/*" \
  --use-npm --turbopack --empty --skip-install --disable-git --yes
```

Hand-assembling a Next app means owning the interaction between the compiler,
the bundler, the PostCSS pipeline and the type plugin yourself, forever. The
generator emits the combination the framework authors test against. `--empty`
drops the marketing landing page; everything that remains is configuration we
would have had to write anyway.

The scaffold was generated at **`16.1.6`** — the pin in `_ref/platform-fe` —
and then deliberately moved to **`16.3.3`**. See "The framework version" below;
that was not a casual bump.

### Why the Node version is a file in the repo

`.nvmrc` says `22.19.0`; `package.json` says `"node": ">=22.19.0 <23"`.

"Works on my machine" is almost always a runtime version difference. The
`engines` field makes `npm install` warn on a wrong major; `.nvmrc` makes
`nvm use` correct it. Both are needed: one detects, the other fixes. This is the
first thing to check when the cloud PC behaves differently from this one.

### Why the TypeScript config is stricter than the default

`strict: true` comes from the generator. Four flags were added:

| Flag | What it catches |
|---|---|
| `noUncheckedIndexedAccess` | `sections[0]` is typed `Section \| undefined`, so a card cannot silently read past the end of an array the **agent** supplied |
| `noImplicitOverride` | a renamed base method that leaves a stale override behind |
| `noFallthroughCasesInSwitch` | a missing `break` in the envelope resolver |
| `forceConsistentCasingInFileNames` | an import that resolves on Windows and 404s on the Linux container |

The first and the last matter most here. Every prop this app renders comes from
outside it — over the network, from a graph that can change — so array and index
access is exactly where an assumption becomes a production crash.
`target` moved to `ES2022`: every browser the platform supports has it, and it
avoids down-levelling modern syntax for no reason.

**Cost:** `noUncheckedIndexedAccess` adds real friction; you will write guards
you would otherwise skip. That is the point, and it is cheaper than the crash.

### Why layering is a lint rule instead of a README paragraph

```
shell → cards → agent-ui → contract
```

One direction only, enforced by `no-restricted-imports` in `eslint.config.mjs`:

- **`agent-ui/` may not import the shell, the routes, or (except in
  `registry.tsx`) the cards.** It is the portable deliverable — a folder another
  app can drop in. The moment it imports app chrome, it stops being portable and
  nobody notices until the day someone tries to move it.
- **`cards/` may not import the shell, the routes, or the transport.** A card is
  props in, `respond()` out. A card that can fetch is a card you cannot test
  without a network and cannot reuse in another host.

Written as a convention, this rots in a fortnight — a deadline, a shortcut, a
reviewer who does not know the rule. Written as a lint rule, it fails CI. The
cost is one deliberate exception (`registry.tsx`, the composition root) that has
to be spelled out, which is a good trade: the exception is now documented in the
config itself.

`react/no-danger` is `error` for the same reason. Agent text is untrusted input;
it is rendered as text, never as markup, and that is enforced rather than
remembered.

### Why the security headers are set now and the CSP is not

`next.config.ts` sets four headers on every response:

| Header | Reason |
|---|---|
| `X-Frame-Options: DENY` | the app is never a legitimate frame target, so clickjacking has no surface |
| `X-Content-Type-Options: nosniff` | a JSON response can never be re-interpreted as a script |
| `Referrer-Policy: strict-origin-when-cross-origin` | CR ids and Jira keys do not leak in the `Referer` |
| `Permissions-Policy` | camera, microphone and geolocation are denied outright — the app needs none |

Deliberately **not** a Content-Security-Policy. The real `connect-src` is not
known until the agent proxy exists in Step 1. A CSP written early is either
wrong — and then someone disables it during a demo, permanently — or so loose it
certifies nothing. It lands in Step 1 with the sources it is describing.

`poweredByHeader: false` stops advertising the framework and version to a
scanner.

`output: "standalone"` was also set here, to emit a self-contained server bundle
for a smaller container image. **It was removed again in Step 1** — running the
production server against it fails without a Dockerfile that does not exist yet.
See "Two corrections made during this step" under Step 1. It returns in Step 9.

### Why backend hosts have no `NEXT_PUBLIC_` prefix

A `NEXT_PUBLIC_` variable is **compiled into the JavaScript bundle**. It is not a
setting; it is published. So `AGUI_BACKEND_URL` and `AGUI_API_BASE` carry no
prefix and are read only in server code. The browser is told one thing —
`/api/agent`, a same-origin path — and never learns where the backend lives.

This is a deliberate change from the reference implementation, where the four
REST lookups were called from the browser against a public base URL. Those move
behind the same server proxy in Step 1. One authenticated egress point is also
the seam where auth is added later: one function, not thirty call sites.

`.gitignore` ignores `.env*` but re-includes `!.env.example`, because the
example is documentation and belongs in the repo, while the real values never do.

### Why `npm run verify` exists

`typecheck && lint && build`, in that order — the same three commands CI runs.
Fast failure first. A developer can reproduce the pipeline verdict locally with
one word, which is the difference between a gate people respect and a gate
people route around. `lint --max-warnings 0` because a warning nobody must fix
is noise that hides the warning somebody must.

### Verified

```
npm run verify
  tsc --noEmit                    clean
  eslint --max-warnings 0         clean
  next build (Turbopack)          compiled in 16.6s, 3 static routes
npm run dev                       ready in 3.2s on :3000
curl -I http://localhost:3000
  X-Frame-Options: DENY
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=()
  (no X-Powered-By)
```

Headers were checked against the running server rather than assumed from the
config, because a header set in `next.config.ts` that never reaches a response
is the kind of thing that passes review and fails an audit.

### The framework version: parity lost on purpose

`npm install` at the platform's pin produced **28 high-severity advisories
against `next@16.1.6`**: HTTP request smuggling in rewrites, middleware/proxy
bypass in App Router, cache poisoning of RSC responses, XSS in apps using CSP
nonces, and several denial-of-service paths. All fixed in `16.3.1+`.

Two defensible positions existed and they contradict each other:

| | For | Against |
|---|---|---|
| **Stay 16.1.6** | byte-identical to `_ref/platform-fe`; a build that passes here passes there | ships 28 known high-severity CVEs in an app intended for enterprise deployment |
| **Move to 16.3.3** | clean `npm audit`; still `16.x`, so the migration surface is two patch-level minors | exact pin parity is gone; a build difference could in principle appear at merge |

**Decision: 16.3.3.** Security was the governing constraint, the version distance
is small, and several of these advisories are directly on the surfaces this app
actually uses — this is a proxying App Router app, and "middleware/proxy bypass"
plus "SSRF in rewrites" are not theoretical here.

`eslint-config-next` moved with it. The two are released together and a mismatch
means linting against rules written for a different framework version.

**This finding applies to `_ref/platform-fe` unchanged** — it carries the same
pin and therefore the same 28 advisories. That is worth raising with the platform
team as a concrete upgrade path rather than an abstract one, and it converts our
loss of parity into a temporary state rather than a permanent divergence.

Re-verified after the bump: `typecheck`, `lint`, `build` all green on 16.3.3;
`npm audit` reports **0 vulnerabilities**.

---

## Step 1 — Configuration, the agent proxy, health, and the CSP

**Goal:** the app's entire network surface exists and is proven on the wire.
Nothing here is asserted from a config file; every claim was checked against a
running server.

One dependency was added: **`server-only`**. It has no runtime code. Importing it
in a module makes that module a *build error* if a Client Component ever imports
it. That is how `lib/env.ts` — which holds the backend host — is kept out of the
browser bundle by the compiler instead of by discipline.

### Why configuration is validated lazily, and asserted at boot

Three places could validate the environment, and only one is right:

| Where | Why not |
|---|---|
| At module import | `next build` imports route modules, so the build would need production configuration. That is how configuration gets baked into an image — the thing twelve-factor exists to prevent. |
| On first request | The failure surfaces in front of a user, hours after the bad deploy, as a 500 nobody can attribute. |
| **At process start** | ✅ A misconfigured deployment dies immediately. The orchestrator shows a crash loop, which is a diagnosis. |

So `getServerEnv()` is lazy and memoised, and `instrumentation.ts` calls
`assertServerEnv()` in `register()` — which Next runs once per server instance,
before the first request is served. The build phase is skipped explicitly
(`NEXT_PHASE`), which is what keeps `npm run build` working with no environment
at all.

**Verified:** `next build` with `.env.local` removed → succeeds. Server start
with no environment → refuses to serve, both missing variables in one message:

```
Invalid server environment:
  - AGUI_BACKEND_URL is missing or empty
  - AGUI_API_BASE is missing or empty
```

Both problems at once, deliberately. Reporting one variable per restart turns a
two-minute fix into four deploys.

### Why the proxy exists, and what it is allowed to forward

The browser posts to `/api/agent`; that route streams to `agui_server.py`. The
browser never learns the backend host — which is what lets the CSP say
`connect-src 'self'`, the strictest useful value.

The route forwards **three headers and nothing else**: `content-type`, `accept`,
and a correlation id. Relaying arbitrary client headers to an internal host is
how a proxy becomes a smuggling primitive.

Two limits, for two different reasons:

- **512 KB body cap.** A `RunAgentInput` carries message history, so it is not
  tiny — but this route must not become an open relay for arbitrary payloads to
  an internal service.
- **15-second connect timeout, cleared the moment headers arrive.** The timer
  bounds *reaching* the backend. It must not bound the stream: an interrupt can
  leave a graph waiting on a human for hours. One signal used for both would kill
  every long session at 15 seconds — and it would look like a network fault
  rather than a bug.

A client disconnect aborts the upstream request through the same controller, so a
closed tab does not leave a socket and a graph run alive behind it.

**Verified — streaming is genuinely incremental**, upstream emitting every 400ms:

```
+516ms   seq 1
+915ms   seq 2
+1312ms  seq 3
+1717ms  seq 4
+2136ms  seq 5
```

**Verified — abort propagates.** Client cut at 1s; upstream logged
`{"event":"upstream.closed","live":0,"sent":2}`. The run stopped and the
connection count returned to zero.

**Verified — guards return the right codes.** `text/plain` → 415, 600 KB body →
413, `GET` → 405.

### Why an error says less to the browser than to the log

The same failure, two audiences:

```
browser   {"error":"The agent is unavailable.","requestId":"d95ef0d5-…"}
log       {"event":"agent.proxy.unreachable","requestId":"d95ef0d5-…",
           "backendUrl":"http://localhost:8084/copilotkit","reason":"fetch failed"}
```

Internal hostnames, ports and upstream error text are reconnaissance. They go to
the log. The user gets a correlation id to quote in a ticket, which ties their
screenshot to that exact line without telling them — or anyone reading over their
shoulder — anything about the topology.

**In development the URL is echoed back**, because there the reader and the
operator are the same person, and `fetch failed` alone has sent people hunting in
the wrong process. Verified in both modes: dev returned the URL, production
returned `The agent is unavailable.`

### Why `/api/health` does not check the backend

It answers "is this process able to serve?" and nothing more.

A liveness probe that fails when a dependency is down makes the orchestrator
restart *healthy* instances during someone else's outage. A brief backend blip
becomes a fleet-wide restart loop, and recovery is now slower than the original
fault. Readiness — "should traffic be routed here?" — is the probe that may
consider dependencies, and it arrives when there is a load balancer to consume it.

It returns `version` and `commit` from the environment so a running pod can be
tied to a build without guessing. **Verified:** `APP_VERSION=1.0.0
GIT_SHA=abc1234` → `{"status":"ok","configured":true,"version":"1.0.0","commit":"abc1234"}`.

### The CSP, now that the sources are known

Deferred from Step 0 on the grounds that a policy written before the network
shape is known is either wrong or meaningless. The shape turned out to be the
strictest one available — every backend call goes through the server, so:

```
connect-src 'self'
```

An injected script cannot exfiltrate a draft CR, because the policy permits no
destination to send it to.

Inline scripts are permitted **by nonce, not by `'unsafe-inline'`**. Next emits
inline bootstrap scripts for hydration; allowing them with `'unsafe-inline'`
would equally allow anything an attacker injects, which is most of what a CSP is
for. `src/proxy.ts` mints a fresh nonce per request, Next stamps it onto its own
scripts, and `'strict-dynamic'` lets those trusted scripts load their chunks
without this file enumerating bundle URLs that change every build.

**The cost, stated plainly:** a nonce differs per request, so a page carrying one
cannot be prerendered. This app gives up static optimisation of its pages, and
`page.tsx` opts into dynamic rendering explicitly with `connection()`. Acceptable
here — the surface is an authenticated per-user agent session that was never
going to be cached at an edge — but it is a real cost, not a free win.

Two relaxations exist **in development only**, both visible in the header at
runtime: `'unsafe-eval'` (React rebuilds server error stacks in the browser with
`eval`; Turbopack HMR needs it) and `ws:` (the hot-reload socket).

**Verified in production mode** — no `unsafe-eval`, no `unsafe-inline`, no `ws:`:

```
default-src 'self'; script-src 'self' 'nonce-…' 'strict-dynamic';
style-src 'self' 'nonce-…'; img-src 'self' data: blob:; font-src 'self';
connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self';
frame-ancestors 'none'; upgrade-insecure-requests
```

And verified where it counts — **the nonce reaches the markup**: 16 `<script>`
tags in the served HTML, 18 `nonce="` attributes. A policy that blocks the page's
own scripts is a policy someone disables during a demo.

### Why logs are JSON

One line per event, a `requestId` on every line, and the same id returned to the
browser in `x-request-id`. An aggregator can filter
`event:"agent.proxy.unreachable"` or group a whole session by id; it cannot
usefully filter prose. No field values, no CR contents, no PII — identifiers and
outcomes only.

The id is reused from an inbound `x-request-id` when one exists, so a request can
be followed across the ingress, this server and the agent. It is length-bounded
because an inbound header is attacker-controlled and ends up in a log.
**Verified:** the id minted by the proxy arrived at the upstream process.

### Two corrections made during this step

Both were found by running the thing rather than reading it.

**1. `output: "standalone"` was removed.** Set in Step 0 for a smaller container
image. Running the production server against it prints *"does not work with
output: standalone"*, and the documented invocation additionally needs `public/`
and `.next/static/` copied into the standalone directory — steps belonging to a
Dockerfile that does not exist yet. A build flag whose deployment procedure is
missing is a trap for the next person who types `npm start`. It returns in Step 9,
with the container that performs those copies.

**2. A comment in `/api/health` claimed something false.** It said health "must
answer even when configuration is broken". With boot validation in place a
misconfigured process never starts, so that branch is unreachable through that
path — the observed behaviour was a 500 from a server that refused to start, not
a JSON body saying `configured: false`. The guard stays, because health must
never itself throw, but the comment now says what is actually true.

### Verified

```
npm run verify            typecheck ✓  lint ✓  build ✓
build with no .env        succeeds — no runtime config required at build time
boot with no .env         refuses to start, both variables named
/api/health               {"status":"ok","configured":true,"version":"1.0.0",…}
/api/agent                415 wrong content-type · 413 over 512 KB · 405 on GET
                          502 with URL in dev, generic in prod, same requestId
SSE                       5 events ~400ms apart — streamed, not buffered
abort                     client cut at 1s → upstream closed, sent 2, live 0
CSP                       nonce on every script tag; prod header free of
                          unsafe-eval / unsafe-inline / ws:
```

---

## Step 2 — The design system

**Goal:** every value the UI will ever paint exists as a named token, traceable
to a Figma frame, and visible on a page someone can review.

Two dependencies were added: **`clsx`** (conditional class names) and
**`tailwind-merge`** (last-wins conflict resolution when a component's classes
meet an override from its caller). Together they are `cn()`. Neither is
decoration: without merge semantics, a card that accepts a `className` prop
cannot reliably be restyled by its parent, and the resulting bugs look like
CSS specificity mysteries.

### Why the token file *is* the design system

`globals.css` was ported wholesale from the reference implementation, with its
provenance intact: file `OKMf8QB5HkTjgaT3lDR438`, frame ids in the comments.

The rule it encodes: **no hex in a component, ever.** The Figma file is barely
tokenised — only two real variables exist (`Primary/Red #eb1700`,
`Gray/gray-100 #202020`), everything else is raw hex on frames. If components
carried literal hex, "does this match the design?" would become unanswerable
without opening Figma next to every file. With a token file, it is a lookup.

Type steps are named by **pixel size** (`text-16`, not `text-base`) and carry
their Figma tracking and leading. Checking a component against the design becomes
a literal comparison rather than a translation. The tracking is a uniform
−0.014em across every step, which is not a simplification: −0.336/24, −0.224/16,
−0.196/14 and −0.168/12 all equal exactly −1.4%.

Values are in **rem**, and the root font size is
`clamp(12px, calc(100vw / 94.5), 16px)`. The design is authored at a 1512px
reference width; a Windows laptop at 150% scaling reports 1280 CSS px, where
reproducing every size literally makes the fixed chrome (92 + 228 rails,
88 + 88 headers) eat far more of the screen than intended — it reads as "zoomed
in". Scaling the root instead makes the whole UI hold its proportions at any
width.

### The bug `lib/cn.ts` exists to prevent

`tailwind-merge` groups classes to decide which of two conflicting ones wins. It
has no way to know `text-14` is a font size rather than a colour, so it files it
under colours — and drops it the moment a real colour is merged in the same call:

```
cn("text-14 …", "text-ink-900")   →   "… text-ink-900"      // 14px silently gone
```

No error. The class is simply absent from the output. It is worst for `text-16`,
where the result is indistinguishable from working, because 16px is the inherited
default.

`extendTailwindMerge` declares the steps into the `font-size` group, so a size and
a colour coexist and only two sizes conflict.

This is also why the select chip's tracking is a `--tracking-chip` token rather
than a `--text-chip` step: a non-numeric `text-*` name gets classified as a
colour by the same logic and vanishes the same way. The numeric steps survive
only because they parse as numbers.

### Why a build step guards a pair of files

`TYPE_STEPS` in `cn.ts` must list every `--text-*` step in `globals.css`. Nothing
in the type system can enforce that — they are strings in two files, in two
languages. A step added to one and not the other does not error, does not warn,
and appears to work until the first size-plus-colour merge.

So `npm run check:tokens` compares them, and it runs inside `npm run verify`
between lint and build.

**Verified by breaking it on purpose.** Removing `"10"` from `TYPE_STEPS`:

```
check-type-steps: globals.css and cn.ts disagree.
  In globals.css but not TYPE_STEPS: text-10
  → these will be dropped when merged with a text colour.
exit=1
```

A guard that has never failed is a guard nobody has tested.

### Why the fonts are local files, not a stylesheet link

`next/font/local` self-hosts the seven Johnson faces. Three consequences, all
wanted:

1. **The CSP needs no exception.** `font-src 'self'` holds, because the files are
   served from this origin. A Google Fonts link would have required allow-listing
   two external hosts in the policy written in Step 1.
2. **No layout shift.** Font metrics are read at build time and a matching
   fallback is generated, so text does not reflow when the face arrives.
3. **No third-party request per visitor.** In an enterprise deployment that is
   also a privacy answer, not only a performance one.

**Verified:** faces served from `/_next/static/media/JohnsonDisplay_*.woff`, and
`--font-johnson-display: "johnsonDisplay", "johnsonDisplay Fallback"` present in
the compiled stylesheet.

**A known gap, carried forward:** the supplied set has no Johnson Text Light. If
a frame calls for it, raise it rather than substituting a nearby weight — a
substituted weight is a silent deviation from the design that nobody will catch
in review.

### Why there is a `/dev/tokens` page

A token file is a list of hex values nobody can meaningfully review. Rendered,
"is this the right red?" and "did the 3.25px chip radius survive the port?"
become questions answerable by looking.

It is guarded by a server-side `NODE_ENV` check in a Server Component, so in a
production build the page is not merely unlinked — its markup is never produced
and the route ships as a not-found. Dev surfaces that are only unlinked have a
way of being found.

**Verified:** 200 in development, **404 in production**.

### Verified

```
npm run verify        typecheck ✓  lint ✓  check:tokens ✓  build ✓
check:tokens          7 type steps paired (10, 12, 14, 16, 20, 24, 64)
check:tokens (broken) exits 1 and names the missing step
/dev/tokens           200 in dev · 404 in production
fonts                 served from /_next/static/media, --font-johnson-* defined
```

---

## Step 3 — The contract layer

**Goal:** the portable deliverable. `src/agent-ui/` now imports nothing from this
app and could be moved into another host as a folder.

No dependencies were added. This layer is deliberately transport-agnostic and
framework-light — it is the part most likely to outlive this repo.

### Why the generator was ported, not its output

`ui-contract.json` is a verbatim snapshot of the backend's own
`agui.ui_contract.contract_document()` — 8 components, 7 shared shapes. From it,
`scripts/gen-contract.mjs` produces `contract.generated.ts` (types) and
`fixtures.generated.ts` (the backend's own example payload per component).

Copying the generated files would have been faster. Copying the **generator** and
running it proves the pipeline works here, which is the thing that has to keep
working every time the backend changes. The output came out byte-identical to
the reference implementation's, which is the result that makes the port
trustworthy.

### Why the snapshot is committed

Because cards must build, render and be reviewed with **no backend running**. A
contract layer that requires a live agent to compile makes every frontend task
depend on someone else's process being up.

The cost is that a committed snapshot can go stale. That is handled by making
staleness loud rather than by avoiding the snapshot:

```
npm run contract:pull   # GET /api/ui-contract from a running agui_server.py
npm run contract:gen    # regenerate types + fixtures
npm run typecheck       # a real prop change now fails HERE, not in QA
```

### Why a build gate compares generated files to their source

Committed generated files have one classic failure: someone hand-edits them, or
refreshes the JSON and forgets to regenerate. Either way the types stop
describing the contract and nothing complains until a card renders the wrong
shape.

`npm run check:contract` regenerates and compares, byte for byte, inside
`npm run verify`.

**Verified by breaking it** — one appended comment line in
`contract.generated.ts`:

```
check-contract: generated files are stale or hand-edited.
  contract.generated.ts does not match ui-contract.json
  → run: npm run contract:gen
  → never edit a .generated.ts file by hand.
exit=1
```

### Why a pending interrupt outranks agent state

Every HITL node calls `interrupt(ui)` with the component envelope **and** writes
the same envelope to `AgentState.ui_component`, which rides the AG-UI state
channel. Two sources, and they are not equally reliable.

The AG-UI interrupt contract specifies that a state snapshot is emitted *before*
the interrupt-carrying `RunFinished`, and is deliberately **not** re-sent when a
client reconnects to an already-pending interrupt — so replay-based and
checkpoint-based resumption behave identically. A reconnect while a card is on
screen therefore re-delivers the interrupt but no fresh snapshot.

So `resolveEnvelope` reads the interrupt first and falls back to state. Getting
this backwards produces a card that blanks or reverts on reconnect — an
intermittent failure, which is the worst kind to debug months later.

The same fact drives the `pending` prop: a card rendered from state after the run
moved on must not look actionable.

### Why the registry is partial on purpose

`REGISTRY` is typed `Registry` (every key optional) while the cards are built.
An unimplemented name resolves to `undefined`, the host renders `FallbackCard`,
and the user is told plainly that a step could not be displayed.

When the eighth card lands it becomes `TotalRegistry`, and from that moment a
component added to the contract without a card here is a **compile error** rather
than a runtime fallback.

Starting total would have forced one of two bad things: placeholder components
that lie about being implemented, or a build that cannot go green until every
card is finished. Starting partial and tightening at the end gets the compile-time
guarantee without either.

### Why the host does no stage-sniffing

`AgentComponentHost` never inspects props to work out which screen it is looking
at — no `labels.includes("Similarity score:")`, no
`options.some(o => o.value === "approve")`. The agent names the component; the
host looks it up.

Heuristics of that kind are how a controlled-UI model quietly degrades back into
an uncontrolled one: each one is a place where the frontend decides what the
agent meant. If a heuristic ever seems necessary here, the fix belongs in the
backend's `ui_contract.py`.

There is exactly one cast in the layer, on one line of the host, and it is
commented: `resolution.props` is `unknown` because it crossed a transport
boundary. The contract guarantees it matches `PropsByName[name]` for a name that
passed validation, and there is no way to express "validated at runtime" to the
compiler without re-deriving every schema. Everything downstream of that line is
fully typed.

### Why every failure renders a card instead of nothing

`solman_write` can report success with a null CR id. A contract mismatch can land
mid-approval. On a regulated change-request path a blank panel reads as "nothing
happened" when the truth may be "something happened and you cannot see what".

So `Resolution` is a closed union of named failures — `empty`,
`unknown-component`, `unsupported-version`, `malformed` — each with its own
message, and `FallbackCard` tells the user their request is not lost and to check
SolMan before retrying.

**Verified at `/dev/cards`:** 13 distinct failure messages across the gallery, no
blank panels. Version is checked before name deliberately — a future contract may
rename components, so an unknown name under an unknown version is a *version*
problem and should say so.

### Why the gallery renders through the transport's path

`/dev/cards` builds an envelope, hands it to `resolveEnvelope`, then to the host —
rather than importing a card and passing fixture props directly.

Direct rendering would exercise the card but skip validation, the registry lookup
and the interrupt-versus-state precedence: the three places a real failure
actually occurs. Going through the production path is what makes "it looks right
in the gallery" mean something.

### A lint rule earned its place

The React compiler lint rejected `setState` inside an effect in the gallery. It
was right: the drift report is derivable during render, and holding it in state
was a second copy of a fact already available. The effect now exists only for the
console report — a side effect on an external system, which is what an effect is
for.

Worth recording because it is the argument for `--max-warnings 0`: the rule fired
on a dev-only page where the cost of the mistake was nil, and the same pattern in
a card would have been a cascading render.

### Verified

```
npm run verify         typecheck ✓  lint ✓  check:tokens ✓  check:contract ✓  build ✓
gen-contract.mjs       byte-identical output to the reference implementation
check:contract         passes; exits 1 on a single hand-edited line
/dev/cards             200 in dev · 404 in production
                       8 contract components + 5 injected failure paths
                       13 distinct messages, 0 blank panels
registry               0/8 implemented — partial by design until Step 6
```

---

## Step 4 — Card primitives

**Goal:** the shared parts every card is assembled from, each in every state the
design defines, visible on one page.

No dependencies added. 40 icon assets — the exported Figma SVGs — were committed
under `public/shell/`.

### The layering rule caught a real coupling on first contact

Seven of the primitives imported `Icon` from `@/shell/`. The Step 0 lint rule
rejected all seven, and it was right to: `shell/` is the half of the app that
gets replaced when this merges into a host application, and `cards/` is the half
that moves. A card that imports from the shell cannot move without it.

The fix was **a leaf layer, not an exception**:

```
shell → cards → agent-ui → contract
  ↘      ↓
     ui / lib          (leaves: they import nothing local)
```

`src/ui/` holds presentational primitives that know nothing about this
application; `src/lib/` holds helpers. Anything above may use them; they may use
nothing above — also lint-enforced.

The alternative was an eslint exception for `Icon`, which would have left the
coupling in place and hidden it behind a rule saying it was fine. Exceptions
accumulate; layers do not.

**Both rules verified by breaking them:**

```
src/cards/Radio.tsx   '@/shell/Icon' import is restricted …
                      Cards are props in, respond() out.
src/ui/Icon.tsx       '@/cards/CardShell' import is restricted …
                      ui/ and lib/ are leaves.
```

### Why one `Field` with a `state` prop rather than nine components

The Figma component set defines nine field variants. They differ **only** in
border colour, helper colour, fill and trailing adornment — geometry is identical
across all of them: 55px tall, 24px horizontal padding, 16px radius, label 14/500
above at a 6px gap, helper 12/400 below.

Nine components would mean nine copies of that geometry, and the ninth copy is
where a 55px becomes a 56px. One component with a `state` prop has one copy.

Two details worth keeping:

- **`default` and `disabled` render no trailing icon.** The component set defines
  an `icon/info` layer for them, but on the real form instances that layer is
  toggled **off** — confirmed through the Figma REST API (`visible: false`).
  Rendering it because the component set has it would put an icon on screen that
  the design hides.
- **`onBlur` receives the value from the event, not from render state.** A blur
  can land before React has re-rendered with the latest keystroke, so a handler
  closing over the previous value acts on stale input. That is precisely the case
  the Jira lookup has to get right in Step 5.

`Field` does no fetching, no debouncing and no validation. Those rules are the
agent's, so they live in the card that owns the form.

### Why `CardShell` was extracted before the first card

All eight cards share the chrome, and the meta strip is **contract data**
(`CardMeta`) rather than anything a card computes. Extracting it after the third
card would mean three cards to retrofit and three chances to leave one behind.

Two design details that are easy to lose and hard to spot afterwards: the card's
**bottom-left corner is square** while the other three are 16px — it is a speech
bubble pointing at the avatar — and the avatar is **bottom-aligned** with the
card, not top.

### Why expanding and selecting are separate controls

`OptionRow` has two independent hit areas: one selects the option, one opens its
details. Reading what an option contains is not the same act as choosing it, and
a row where "find out more" also commits the choice is a trap on a screen that
raises a change request.

### Why a `/dev/primitives` page exists

The states that matter most are the ones a happy path never reaches: an error
field, a missing field, a disabled option row, an open modal. Producing them
against a real graph is slow enough that in practice nobody checks them — so they
are never reviewed, and they are exactly where a design regression hides.

Here they are all on screen at once, always.

### Two type errors the toolchain caught, both real

Building the page against the generated types surfaced two mistakes that would
otherwise have reached a card:

1. **`FIXTURES.templateOrCrPicker.options` does not exist** — the field is
   `reference_options`. Invented from memory; caught by the generated types the
   moment it was written.
2. **`reference_options?.[0]` is `OptionRow | undefined`** — both because the
   field is optional in the contract and because of `noUncheckedIndexedAccess`.

The second is the flag from Step 0 earning its cost. Both facts are true of the
live payload as well — the agent may send neither — so the guard written here is
the same guard a real card needs. That is the friction working as intended: it
appeared on a dev page rather than as a blank card in a demo.

### Verified

```
npm run verify        typecheck ✓  lint ✓  check:tokens ✓  check:contract ✓  build ✓
layering rules        both fail correctly when violated on purpose
/dev/primitives       200 in dev · 404 in production
field states          default · error · missing · verified · disabled · dropdown
icons                 field-error, field-verified, field-info, agent-avatar,
                      chevron-down-field all 200 from /shell/
```

---

## Step 5 — The first four cards, and the lookup proxy

**Goal:** `crModeChoice`, `crIntakeForm`, `templateOrCrPicker` and
`cycleIdPicker` rendering from the backend's own fixtures, with the two REST
lookups they depend on reachable — through the server, never from the browser.

No dependencies added.

### The lookup proxy is an allow-list, and that is the whole design

The obvious shape for this route is `/api/lookup/[...path]`, forwarding whatever
it is given. That hands any visitor a GET primitive against an internal host:
`/api/lookup/actuator/env`, `/api/lookup/../admin`, or simply a way to enumerate
what else runs on that server. It is server-side request forgery with a friendly
URL, and it is one of the advisories that made us leave `next@16.1.6` in Step 0.

So four resources are named in the file, each bound to a **fixed** upstream path
and a **fixed** list of permitted query parameters:

| Resource | Upstream | Params | Cache |
|---|---|---|---|
| `platforms` | `/api/platforms` | — | 300s |
| `target-systems` | `/api/target-systems` | `platform` | 300s |
| `templates` | `/api/templates` | `platform` | 300s |
| `jira-lookup` | `/api/jira-lookup` | `jira_id` | **no-store** |

The incoming query string is never forwarded wholesale; each permitted parameter
is copied across by name and length-capped. Anything unrecognised returns **404,
not 403** — a 403 confirms the route exists and is worth probing.

Jira is never cached: a ticket can change between two reads, and a stale pre-fill
would put text into a change request that no longer matches its source. The other
three are `private, max-age=300` — `private` because once auth lands a response
may be shaped by who is asking, and a shared cache must not serve one user's
lookup to another.

**Verified against a logging upstream.** Five SSRF attempts, and the record of
what the backend was actually asked for:

```
actuator/env             404        upstream saw:
../admin                 404          /api/target-systems?platform=SAP
..%2fadmin               404          /api/jira-lookup?jira_id=PLATFORM-1423
internal                 404          /api/target-systems?platform=SAP
platforms/../../secret   404
```

Nothing outside the table reached the backend. `?platform=SAP&admin=true&debug=1`
arrived upstream as `?platform=SAP` — the extra parameters were dropped, not
passed on. An over-long parameter returns 400.

### Why the cards call a same-origin path

The reference implementation put `NEXT_PUBLIC_AGUI_API_BASE` in the browser and
called the backend directly. Here `LOOKUP_BASE` is `/api/lookup`.

Four consequences, all of them things we already committed to:
the browser has no backend host to learn; CORS never enters the picture; the CSP
keeps `connect-src 'self'` with no exception; and when auth arrives the token is
attached in one server-side place instead of at every call site.

The cost is one extra hop per lookup, on four small JSON endpoints behind a proxy
on the same host. That is not a real cost.

`apiGet` also carries the proxy's `requestId` into the thrown error, so a
user-visible failure can quote a reference that matches a server log line without
revealing what actually went wrong.

### The Jira pre-fill rules, and why they live in a hook

Five rules, each a decision with a reason, and they are far easier to see — and
later to test — outside the card:

1. **Typing fires nothing.**
2. **600ms after the last keystroke, or immediately on blur** — leaving the field
   means the user is done.
3. **Only a key matching `^[A-Za-z][A-Za-z0-9]+-\d+$` calls the endpoint.** A
   half-typed key produces no request *and no error*: it is not a mistake yet,
   and colouring a field red while someone is mid-word is noise.
4. **Requests are sequence-numbered.** A slow response for an old key is
   discarded rather than allowed to overwrite a newer one. Without this, typing
   two keys quickly can leave the form showing the first one's data — a bug that
   appears only on a slow connection, which is where nobody tests.
5. **Fill only where the user has not typed their own text.** This one lives in
   the card, because only the card knows what is currently in those fields.

Rule 4 is why `Field.onBlur` passes the value from the event rather than from
render state: a blur can land before React has re-rendered with the latest
keystroke, and a handler closing over the previous value acts on stale input.

A dead lookup does not break the form. The field stays typable, and the agent
validates the value regardless — the pre-fill is a convenience, not a gate.

### Bulk stays clickable, deliberately

`crModeChoice` sends `enabled: false` for the bulk mode. The card renders it
**selectable anyway**.

That looks wrong until you read the graph: `node_0_wait` routes on
`mode == "bulk"` and never reads `enabled`, answering with the `featureComingSoon`
card. Disabling it client-side would make a designed screen unreachable and
replace a clear "not yet" with a dead control that explains nothing.

Flipping `BULK_CR_ENABLED` on the backend therefore needs no frontend change.

### Verified

```
npm run verify        typecheck ✓  lint ✓  check:tokens ✓  check:contract ✓  build ✓
/dev/cards            unknown-component fallbacks 9 → 5
                      (4 cards now render; 1 is the injected synthetic name)
lookup allow-list     5 SSRF attempts → 404, none reached the upstream
unlisted params       dropped before the request is built
oversized param       400
registry              4/8 implemented
```

---

## Step 6 — The last four cards, and the registry closes

**Goal:** all eight contract components implemented, and the registry tightened
so a ninth cannot appear without a card.

No dependencies added. `draftReview`, `fieldPrompt`, `submissionResult` and
`featureComingSoon` landed, along with `DraftSection`, `FieldRetry` and
`regenerateField`.

### The registry became total, and that is a compile-time guarantee now

`REGISTRY` moved from `Registry` (every key optional) to `TotalRegistry` (every
key required). This was the plan from Step 3: start partial so the build can go
green while cards are built, tighten the moment the last one lands.

**Verified by simulating a backend release.** A ninth component was added to
`ui-contract.json`, types regenerated, and the build asked to compile:

```
src/agent-ui/registry.tsx(37,14): error TS2741:
  Property 'riskAssessment' is missing in type '{ crModeChoice: … }'
  but required in type 'TotalRegistry'.
```

That is the whole controlled-UI model enforced by the compiler: a component the
agent can emit that this app cannot render stops the build, rather than reaching
a user as a fallback card.

`FallbackCard` does not become dead code. It still covers what the compiler
cannot see — a malformed envelope, an unsupported contract version, a name from a
backend newer than this build. Verified in the gallery: with all eight cards
rendering, the only fallbacks remaining are the five failure paths injected on
purpose.

### Why draft actions send literal tokens, never labels

`draftReview` sends `approve` and `reject` — never the button text.

`cond_edge_b`'s approval guard is a **substring test**. "Submit for Approval"
contains no `approve`, so the designed primary action would silently fail to
approve anything. "I do not approve" contains one, so a rejection typed as prose
would approve. Sending the token decouples the label from the routing entirely,
and the design is then free to say whatever it says.

The card also infers which action is destructive from a regex on its value. That
is a guess, and a `tone` field on actions — as `DetailRow` already has — would
remove it. Raised with the backend team.

### Why a field edit sends a turn instead of saving

An editable field's pencil opens an inline editor with two outcomes: **Update
draft** and **Keep original**. Choosing update sends `"${label}: ${value}"` —
exactly the shape `_looks_like_field_update_message` accepts — and newlines are
collapsed so a multi-line description arrives as one line.

The copy says so explicitly, because the control looks like a form field and
behaves like a message. An edit is *this turn's answer*: the agent revalidates
against the same `DROPDOWN_FIELDS` / `get_field_metadata` the card was rendered
from, and presents the draft again. A control that implies it saved, when what it
really did was send a message, is exactly the kind of thing people misread on a
screen that raises a change request.

**One edit at a time** — opening an editor disables every other pencil. There is
one response channel and one answer per turn; two pending edits could not both be
sent, and offering them would imply otherwise.

### Why retry offers a candidate rather than a replacement

Fields the agent authored carry a second control. Retry does not open an editor —
it asks for the value to be written again and shows the result **beside** the
original:

```
idle ──retry──▶ loading ──▶ compare ──┬── Keep original  → nothing sent
                                       ├── Retry again    → loading
                                       └── Use this one   → sends "Label: value"
```

A regenerated description that silently overwrote the original would be a change
nobody agreed to, on a card whose entire purpose is approving what will be
submitted. So the new value sits next to the old one, labelled, until someone
chooses. When the two come back identical the card says so and disables the
choice rather than offering a no-op that looks like a decision.

Edit and retry are kept distinct deliberately: an edit is the user supplying
text, a retry is the agent supplying it — "this is wrong, here is the right text"
versus "try again, I don't like this one".

### Why success with no CR id renders as a failure

`solman_write` can return `success: true` with `cr_id: null`. `submissionResult`
treats that as a failure.

Telling someone their change request was created, while giving them no identifier
to reconcile against, is worse than telling them to check: it ends the interaction
with false confidence on a regulated path. The card says to verify in SolMan
instead.

### Two gaps carried forward, both marked

The retry control is **UI-only until the backend lands a regenerate path** —
there is no reply shape meaning "produce this again", so `regenerateField.ts`
returns a locally-composed alternative and logs a development notice. The whole
of the real implementation is the body of one function; the card awaits a promise
of a string and does not care where it came from.

And nothing in `FieldRow` distinguishes an agent-authored value from a
SolMan-supplied one, so the regenerable field list is hard-coded to two contract
keys — precisely the client-side inference the contract exists to remove.

Both are recorded in `docs/GAPS.md`, which is new in this step: a register of
what is knowingly incomplete and who can close it. Most of these are not ours.
The rule it enforces is that **a gap is written down and walked past, never
quietly worked around** — a workaround nobody recorded becomes the design a year
later.

### Verified

```
npm run verify        typecheck ✓  lint ✓  check:tokens ✓  check:contract ✓  build ✓
registry              8/8 — TotalRegistry
9th contract component → TS2741 at the registry, build stops
/dev/cards            all 8 render; remaining fallbacks are exactly the 5
                      injected failure paths (empty, 2 malformed,
                      unsupported-version, unknown-component)
```

---

## Step 7 — The transport, and the conversation

**Goal:** a real AG-UI session — interrupt, resume, reconnect — and the
conversation transcript the design calls for.

One dependency: **`@ag-ui/client`**. One dev-only route: a scripted backend that
serves the real SSE wire format.

### The two protocol traps, and proof they are real

Both were found by reading `ag-ui-langgraph==0.0.42`, the version `agui_server.py`
pins. The current AG-UI documentation describes a newer protocol, and following it
fails **silently** in both cases — no error, no log line, nothing to explain it.

**1. Interrupts arrive as a CUSTOM event named `on_interrupt`.** `RunFinishedEvent`
is constructed with no `outcome` field, so `agent.pendingInterrupts` and the
`outcome: "interrupt"` branch never fire against this backend. Confirmed on the
wire — one opening run emits:

```
RUN_STARTED · STEP_STARTED · CUSTOM · STATE_SNAPSHOT
MESSAGES_SNAPSHOT · STEP_FINISHED · RUN_FINISHED
```

and the envelope is in the CUSTOM event's `value`:

```
"name":"on_interrupt","value":{"version":1,"name":"crModeChoice","props":{…
```

**2. Resume travels in `forwardedProps.command.resume`.** `RunAgentInput.resume`
exists in the protocol *and* on `runAgent()`, and `agent.py` never reads it.
Three consecutive answers, sent both ways:

| Sent as | Turn 1 | Turn 2 | Turn 3 |
|---|---|---|---|
| `forwardedProps.command.resume` | `crIntakeForm` | `templateOrCrPicker` | `cycleIdPicker` |
| `resume` (protocol-legal) | `crModeChoice` | `crModeChoice` | `crModeChoice` |

The second row is the trap: accepted by Pydantic, no error returned, and the
graph simply never wakes up. It looks like the UI is ignoring clicks.

### Why the frontend has to own the transcript

The client asked for a conversation: each answered card stays on screen with its
final values locked, followed by the user's reply as a bubble.

Nothing in the protocol provides that. `AgentState.ui_component` holds the
**latest** card and nothing before it, so there is no history to ask for. The
frontend accumulates its own record as envelopes arrive.

**Storage: sessionStorage, per thread.** In-memory alone loses the conversation
on refresh, which on a change-request path means someone who pressed F5 cannot
see what they already approved. sessionStorage survives that, stays on the one
device, and clears itself when the tab closes — appropriate for data containing
draft CR contents. It does not survive a different device; closing that needs the
backend to keep an envelope list per thread, and is recorded in `GAPS.md` to
raise with their team.

### Why the transcript is an external store, not `useState`

Three approaches were tried, in this order:

| Approach | Why it failed |
|---|---|
| Lazy initialiser `useState(() => load())` | sessionStorage does not exist during server rendering. Server renders an empty transcript, client renders a full one, and React resolves the mismatch by silently discarding one. |
| Read in an effect | Works, but it is a cascading render on every mount — and the React compiler lint rejected it, correctly. |
| **`useSyncExternalStore`** | ✅ `getServerSnapshot` returns a stable empty transcript; the client swaps in the real one after mount, with no mismatch and no extra render. |

Reading an external store is exactly what that hook is for. `transcriptStore.ts`
holds the snapshot; writes are plain calls from event handlers — an envelope
arriving, a user answering — not effects reacting to render.

**Verified:** the server-rendered HTML contains "Reading the stored transcript…",
`status: idle`, `turns: 0` — the empty server snapshot, exactly as intended.

The lint rule fired twice in this step and was right both times. The second was
the turn-append effect, which moved into the event handlers where the events
actually arrive.

### Why a turn carries both a value and a label

`respond(value, label)` — additive, and the two must stay separate.

`value` is what the graph routes on: `approve`, `single`, a field value. `label`
is what the card displayed: "Submit for Approval". A transcript that echoed
`approve` back would be showing the user routing internals; a graph sent
"Submit for Approval" would fail its substring approval guard.

The **card** supplies both, because the card is the only thing that knows which
label went with which value. Deriving it in the session would mean inspecting
props to work out what the agent meant — the stage-sniffing the host is forbidden
from doing.

The intake form is the one place they diverge sharply: the payload is a
twelve-line field dump the graph parses, and the label is
"Change request details submitted". Echoing the dump as a chat bubble would bury
the conversation under a form, and those values are already visible in the locked
card directly above it.

### Why settled cards get their answer back

`AgentCardProps` gained `answer`. Cards track their own selection while the user
chooses, but that state does not survive a reload — so a restored transcript
would show a settled `crModeChoice` with nothing selected: a record of the
conversation that omits the answer. Cards now seed from `answer` instead.

The locking itself needed no work: seven of the eight cards already went inert on
`pending === false` from the day they were written, and the eighth has no
controls. `AgentComponentHost` gained `settled`, because an earlier turn is not
answerable regardless of how its envelope originally arrived — otherwise the
transcript is a page full of live approve buttons.

### Why past turns are re-validated on render

`Transcript` puts every stored envelope back through `resolveEnvelope`.

A stored envelope is **not** trusted input: it was written by an earlier build of
this app, into storage the user can edit, and the contract may have moved since.
Re-validating means a transcript entry that no longer matches the contract renders
a stated failure rather than being cast into a card's props and crashing it.

### Why reconnects do not duplicate cards

A pending interrupt is re-delivered on every reconnect, and in a normal turn the
same envelope arrives twice anyway — once on the state channel, once as the
interrupt. `isSameQuestion` compares component, version and props, so the second
arrival is recognised rather than appended.

State is also blocked from opening a turn while an interrupt is open, because on
reconnect the snapshot is stale by design.

### The scripted backend, and why it is guarded

`/api/agent/mock` serves the **real** AG-UI SSE wire format — `HttpAgent`, its
parser and every subscriber path are exercised exactly as they will be against
Python. The only thing missing is the graph. Five scenarios: `flow`, `reconnect`
(interrupt re-delivered with no snapshot), `delta` (card arrives only as a JSON
Patch), `text` (streamed assistant message), `error`.

It carries a production guard. A route that fabricates approval screens must not
exist in a production build, and "nothing links to it" is not a control.

**Verified in a production build** — every development surface is gone:

```
/dev/session     404      /dev/tokens       404
/dev/cards       404      /api/agent/mock   404
/dev/primitives  404      /  (real page)    200
```

### Verified

```
npm run verify          typecheck ✓  lint ✓  check:tokens ✓  check:contract ✓  build ✓
opening run             RUN_STARTED · STEP_STARTED · CUSTOM · STATE_SNAPSHOT ·
                        MESSAGES_SNAPSHOT · STEP_FINISHED · RUN_FINISHED
interrupt               delivered as CUSTOM "on_interrupt", envelope in .value
resume (correct shape)  crIntakeForm → templateOrCrPicker → cycleIdPicker
resume (protocol shape) crModeChoice → crModeChoice → crModeChoice — never advances
SSR snapshot            empty, no hydration mismatch
production build        all five dev surfaces 404
```

---

## Step 8 — The designed shell

**Goal:** the app in its real chrome — rail, sidebar, headers, composer, landing
screen — with the conversation running inside it.

One dependency: **`zustand`**, for shell UI state. The rail and the sidebar each
read and write the other's collapsed state (the rail's expand chevron lives in
one and changes the layout of both), so prop-drilling it through the header would
mean threading state through components that have no interest in it. It also
matches the platform app's own convention (`store/useChatStore.ts`).

Nothing agent-related lives in that store. Agent state arrives over AG-UI and is
resolved by `agent-ui/`, which may not import the shell — still lint-enforced.

### The shell is no longer disposable, and that changed one thing

In the reference implementation `src/shell/` was explicitly throwaway chrome,
there only to demonstrate the flow in context. Here it is a deliverable: the
design specifies it, and this app is what people will use.

That does not change the layering — `agent-ui/` and `cards/` still may not import
it, so the portable half stays portable — but it does mean the shell gets the
same treatment as the cards: geometry from the frames (92px rail, 228px sidebar,
88px header bands), tokens rather than hex, and no invented states.

### Why the children slot stopped scrolling

`AppShell` used to own the scroll container for whatever it rendered. The
transcript cannot work that way: it decides whether to follow new turns or leave
the user where they scrolled to, and it cannot make that decision about a
container it does not control. Two nested scrollers would also fight for the
wheel.

So the slot is `overflow-hidden` and the child owns its scrolling. The landing
screen wraps `Greeting` in its own scroller; the transcript brings its own.

### The bug this step nearly shipped

Replacing the placeholder home page with the real app made `page.tsx` a Client
Component. The route silently went from `ƒ` (dynamic) back to `○` (static).

That breaks the CSP from Step 1, and it breaks it in the worst possible way. A
nonce must be unique per request; a page prerendered at build time has no request
to take one from, so Next cannot stamp its script tags — while `src/proxy.ts`
still sends `script-src 'self' 'nonce-…' 'strict-dynamic'` on every response.

A production build served:

```
script tags:      12
nonce attributes:  0
```

Twelve scripts, none of them permitted to run. **The page would have rendered
blank in production and worked perfectly in development**, because development
adds `'unsafe-eval'` and a looser style policy. Nothing warns about it: the build
succeeds, the header is present and correct, and the route table's `○` is the
only visible symptom.

The fix is a two-file split. `page.tsx` is a Server Component whose only job is
`await connection()`, which forces the route to wait for a request; `CrCoApp.tsx`
holds the interactive half. After it:

```
script tags:      12
nonce attributes: 14
```

**This is the argument for checking on the wire rather than reading the config.**
Every individual piece was correct — the CSP, the proxy, the page — and the
combination was broken. Only a request to a production build showed it.

Worth remembering as a rule: **if the route table shows `○` for a page, the nonce
is not reaching it.** That column is now a security check, not a performance note.

### What the landing screen decides, and what it does not

`CrCoApp` chooses exactly one thing: landing screen, or conversation. Everything
after `start()` comes from the contract. Free text typed into the composer goes to
the same resume channel as a card's answer — `fieldPrompt` accepts it, and the
graph decides what to make of it.

The user's display name is a single constant with a pointer to G11. It is the only
thing the UI needs from an identity provider today, so wiring MSAL later is one
function rather than a search.

### Verified

```
npm run verify        typecheck ✓  lint ✓  check:tokens ✓  check:contract ✓  build ✓
route table           / is ƒ (dynamic) — required for the nonce
production /          12 script tags, 14 nonce attributes
                      shell markup present (composer placeholder, chat title)
dev /                 200, landing screen renders
```

---

## Layout, after Step 8

Two problems reported once the shell was real: the chrome looked oversized and
the conversation looked squeezed. They had separate causes.

**The scale only considered width.** The artboard is 1512×982. A 1280×720 laptop
is 85% of the reference width but **73% of its height** — and the root size was
computed from width alone, so on a short viewport the two 88px header bands and
the composer kept nearly their full height while the conversation took what was
left. The rule now follows whichever axis is more constrained:

```css
font-size: clamp(12px, min(100vw / 94.5, 100vh / 61.4), 16px);   /* 61.4 = 982/16 */
```

Nothing changes at or above the reference size, so the design is untouched where
it was authored.

**The transcript padded a slot that was already padded.** `AppShell` pads it and
`Transcript` added `p-8` of its own — 56px above the first card and 48px each
side, for no reason anyone had chosen.

**The sidebar now opens collapsed.** 92px instead of 228px, which returns about
10% of the viewport width to the conversation. It is the largest lever available
without deviating from the frames, because collapsed is itself a designed state
(57320:70529), and the expand control is untouched.

Worth recording, because the instinct was wrong: **scaling the root down further
would not have helped.** Cards are in `rem` too, so a smaller root shrinks the
conversation along with the chrome — more fits on screen, but nothing gets
bigger. Only reducing *fixed* chrome gives the content column real pixels.

---

## Step 9 — Tests, CI, and the readiness probe

**Goal:** the verification stops depending on someone remembering to do it.

Containerisation is deliberately **not** in this step — DevOps owns it, and
`output: "standalone"` returns with the Dockerfile that performs the `public/`
and `.next/static/` copies (GAPS G10).

### Why these tests and not others

Everything up to here was verified by running it and recording the evidence.
That is real verification, but it proves the code worked *that day*. The suite
covers the places where a future change would break something silently:

| Area | What is actually asserted |
|---|---|
| `resolveEnvelope` | interrupt beats state; every failure branch; version checked before name; every failure produces a message |
| Transcript store | reconnect does not duplicate a card; a repeat *after* an answer does; snapshot identity is stable; corrupt storage is dropped, not rendered |
| Cards | all eight render from the backend's own fixtures with no fallback; **none can answer once settled** |
| Lookup proxy | six traversal attempts refused *without contacting the backend*; unlisted parameters dropped; Jira never cached |
| Agent proxy | SSE headers preserved; 415/413 guards; only three headers forwarded |
| Health / readiness | liveness stays 200 while a dependency is down |

Two of those deserve expanding.

**Snapshot identity.** `useSyncExternalStore` compares snapshots by reference and
loops forever if a new object comes back each call. The test is one line and the
bug it prevents is an unresponsive tab.

**Corrupt storage.** The transcript is read back from a store the user can edit,
written by a build that may be older than the code reading it. The test feeds it
half-formed entries and asserts they are dropped rather than handed to a card as
props.

### Cards are tested through the host, never directly

`render(<DraftReview props={FIXTURES.draftReview} />)` would exercise the card
while skipping validation, the registry lookup and the interrupt-versus-state
precedence — the three places a real failure occurs. Every card test goes through
`resolveEnvelope → AgentComponentHost`, the same path the transport takes.

The fixtures come from `ui-contract.json`, so the tests assert against what the
backend *does* send rather than what someone assumed it sends. When the contract
moves, `check:contract` and these tests move with it.

### A test that was wrong, and what it taught

The first version of "a settled card is inert" asserted that every control
carried `disabled`. It failed on two cards — and they were right, not the code:
"View details" on `templateOrCrPicker` and the accordion "Details" on
`draftReview` stay live, because **reading a record is not the same act as
answering it**. That is the same separation the design enforces between expanding
an option and choosing it.

The assertion now clicks every enabled control in a settled card and asserts
`respond` was never called. That is the real invariant — a transcript entry may
be explored, but it may not answer the graph — and it is a stronger test than the
one that was easy to write.

### Two adjustments the runner needed

**`pool: "threads"`.** The default `forks` pool never starts a worker on this
Windows setup: it waits 60 seconds and reports "Timeout waiting for worker to
respond". Pinned in the config so the suite behaves identically on every machine.

**`server-only` aliased to its own empty build.** The package throws unless the
bundler resolves it under the `react-server` condition, and under Vitest there is
no client/server module graph for it to protect. It is aliased rather than
removed from `lib/env.ts` — weakening production code to satisfy a test runner is
the wrong direction, and that guard is what keeps the backend host out of the
browser bundle. The real enforcement stays in `next build`.

### Why readiness is a separate endpoint from health

`/api/health` answers "is this process alive?" and checks nothing else.
`/api/ready` answers "should this instance receive traffic?" and probes the agent
host.

The distinction is operational, not pedantic. A **liveness** probe that checks a
dependency makes the orchestrator restart healthy instances during someone else's
outage — a brief backend blip becomes a fleet-wide restart loop, and recovery
takes longer than the original fault. A **readiness** probe failing takes an
instance out of rotation without killing it, and it returns on its own when the
dependency recovers.

The failure reason goes to the log, not the body: this endpoint is reachable by
anything that can route to the pod, and "which dependency is down" is not a fact
to publish. Its timeout is 3 seconds, because a readiness probe slower than the
interval between probes stacks up, and the pile-up looks like the outage it was
meant to detect.

### What CI enforces

The same gates `npm run verify` runs, listed as separate steps so a failure names
itself, plus two things a local run does not do:

- **`npm ci`, not `npm install`** — installs exactly the lockfile and fails if it
  disagrees with `package.json`. The difference between a reproducible build and
  a hopeful one.
- **`npm audit --audit-level=high`** — this repo gave up framework-version parity
  with the platform app over exactly this, and that decision is worth nothing if
  nothing re-checks it.

The build step runs **with no environment supplied**, on purpose. If someone
reintroduces a module-scope read of `AGUI_BACKEND_URL`, that step is what catches
it — the twelve-factor property from Step 1 now has a guard rather than a note.

### Verified

```
npm run verify    typecheck ✓  lint ✓  check:tokens ✓  check:contract ✓
                  test ✓  build ✓
tests             73 passing across 4 files
routes            /api/ready added; 11 routes total
```

---

## Step 10 — The backend is AgentCore, not `agui_server.py`

**Goal:** talk to the runtime the agent is actually deployed on.

Everything above the transport is unchanged. The runtime container speaks AG-UI:
the same `RunAgentInput` goes in and the same SSE events come out, so the
contract layer, the registry, all eight cards and the transcript were untouched
by this step. Only the wire underneath moved.

### What was actually wrong

This was found by auditing the reference implementation, which had already been
cut over. Three of its differences were not stylistic.

**1. The interrupt value is JSON-encoded.** `dump_json_safe()` in
`ag-ui-langgraph` runs `json.dumps()` on any non-string interrupt value, so
`event.value` is a *string containing* the envelope rather than the envelope.

This was the highest-consequence finding in the whole project. Without the
unwrap, `resolveEnvelope` classifies every card as `malformed` and the user sees
fallback cards from the first screen to the last. And it is invisible in
development, because the scripted mock sent the object — which is what the
protocol says it should send.

The mock now JSON-encodes it too. A mock that is more correct than the backend
tests nothing.

**2. The lookups no longer exist as REST endpoints.** AgentCore's data plane
exposes exactly one route to the outside world, `POST /invocations`. Platforms,
target systems, templates and Jira now ride the same call as a
`forwardedProps.lookup` payload, short-circuited by the runtime before LangGraph
is touched.

`/api/lookup/[resource]` was deleted. The allow-list reasoning behind it was
sound and the tests were good, but the thing it protected no longer exists: there
is no second host to reach and no path to traverse. `apiGet` keeps its old
`GET /api/…?query` call shape and translates, so the two call sites did not
change — a deliberate seam, in case the lookups ever get endpoints again.

**3. Two events we were ignoring.** `progress` carries mid-node status such as
"Fetching Jira ticket AAZM-4668…", and the draft is streamed token by token as
`TEXT_MESSAGE_*` because `node_6` uses a plain LLM call rather than structured
output. Without them the longest steps in the flow look like the app has frozen.

### Why there is no AWS SDK

The runtime is configured with a **JWT/OAuth inbound authorizer**, not the IAM
(SigV4) default. AWS SDKs sign with SigV4 only, so they cannot make this call at
all. The documented OAuth path is a plain HTTPS POST to the data-plane URL with
`Authorization: Bearer <token>`, which is why this app has no `@aws-sdk/*`
dependency and never will while the authorizer stays as it is.

The region and the qualifier are parsed out of the endpoint ARN rather than
configured separately. Two sources for one fact is how they end up disagreeing.

### Three things fixed while porting the token flow

The reference implementation's token cache worked and had three gaps worth
closing, all of which only bite under load or over time.

| | |
|---|---|
| **No single flight** | Every concurrent cold request minted its own token. A page opening with parallel lookups meant several token requests for one page load, against an endpoint that rate-limits. The in-flight promise is now shared. |
| **No invalidation** | A token Azure considers valid can still be refused by the runtime — a rotated secret, a reconfigured authorizer. With no way to drop the cache the process serves 401s until someone restarts it. The proxy now clears it and retries **exactly once**. |
| **No timeout** | A hung identity provider stalled every agent request behind it. Ten seconds. |

**A persistent 401 is reported to the browser as 502, not 401.** It means *our*
credentials are unacceptable to the runtime, which is a server-side fault.
Passing 401 through would tell the browser the *user* is unauthenticated, and in
a host application that wraps this one, that is what triggers a login redirect —
bouncing a user to a sign-in page to fix a misconfigured client secret.

### Why boot validation became advisory in development

`instrumentation.ts` still refuses to start a **production** process with
incomplete configuration. In development it warns and lists everything missing.

The reason is the scripted backend. `/api/agent/mock` needs no AWS or Azure
configuration at all, and it is how the flow is normally worked on. Requiring
production credentials before anyone can look at a card would mean handing a
client secret to everyone who touches the UI, which is a worse security outcome
than the one the strict check was protecting.

The warning names every missing variable, so the eventual 500 from the real proxy
is never a surprise. Verified: a development boot with no configuration logs
`server.started_unconfigured` and lists all four, and the real proxy answers with
the same list rather than a generic failure.

### What the browser is told

Nothing about the topology. Not the ARN, not the region, not the identity
provider. The `x-amzn-requestid` header is forwarded so a browser network entry
can be correlated with an AWS-side trace, and that is all. Errors carry a
correlation id and a generic message; the runtime ARN, the Azure tenant and the
provider's own error text go to the log.

The client secret is never logged, never serialised and never returned. The
`server-only` guard on `lib/env.ts` matters more now than it did: the accident
that would leak it is one careless import away in a codebase without it.

### Verified, without contacting AWS or Azure

Every test stubs `fetch`. Nothing in this repository has ever contacted
`bedrock-agentcore.amazonaws.com` or `login.microsoftonline.com`; what is
asserted is the request the route *builds*.

```
invocation URL     built from the ARN, ARN url-encoded, region from the ARN,
                   qualifier split off correctly
token              minted once, reused across requests, once for three
                   concurrent cold requests, re-minted after a 401
401 handling       retried exactly once, then 502 — never a loop
session id         derived from threadId, padded to 33 chars, stable across
                   turns, valid even when the body is malformed
headers upstream   exactly five; the browser's own Authorization is discarded
content type       forwarded verbatim, so JSON lookups and SSE share one route
secrets            absent from every error body
readiness          mints a token, never invokes the runtime
interrupt encoding parses back to a renderable card; a non-JSON string still
                   reports malformed; a bad version still reports the version
```

96 tests, all six gates green.

### Still open

`npm run contract:pull` fetches `/api/ui-contract` from a running
`agui_server.py`, which is now only a developer dependency for refreshing the
contract snapshot. If AgentCore is the only deployment target, that script needs
a new source. Recorded in `docs/GAPS.md`.
