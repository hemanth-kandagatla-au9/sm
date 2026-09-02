# Gaps

Things that are knowingly incomplete, and why. Every entry states who can close
it, because most of these are not ours to close.

The rule this file exists to enforce: **a gap is written down and walked past,
never quietly worked around.** A workaround nobody recorded becomes the design a
year later.

Status is one of: `open`, `blocked on backend`, `owned by DevOps`, `closed`.

**Before starting work here, read this file.** Several of the odd-looking things
in the code are deliberate accommodations of a gap below, and each one says so.

| Gap | Status | What it costs today |
|---|---|---|
| G1 regenerate action | blocked on backend | field retry is UI-only |
| G2 `regenerable` flag | blocked on backend | two contract keys hardcoded |
| G3 Cancel has no meaning | blocked on backend | Cancel clears the form locally |
| G4 GxP fields unlocked | blocked on backend | editable with no lock reason |
| G5 fabricated `object_id`s | blocked on backend | filtered at the UI boundary |
| G6 timestamp is one string | blocked on backend | cosmetic |
| G7 bulk CR has no contract | blocked on backend | none while the feature is off |
| G8 `draft_cycle_id` undesigned | blocked on backend | rendered minimally |
| G15 no envelope history | blocked on backend | transcript dies on a device change |
| G16 no button-label props | blocked on backend | wording changes need a release |
| G9 automated tests | **closed** | 83 tests, no browser E2E |
| G10 `output: "standalone"` | owned by DevOps | returns with the Dockerfile |
| G11 no authentication | open | every route is open |
| G12 no Johnson Text Light | open | raise it, do not substitute |
| G13 failed submission treatment | open | inferred from the success frame |
| G14 editor / compare frames | open | built from existing primitives |
| G17 CR-before-Template order | open, deliberate | differs from Figma on request |
| G18 `contract:pull` needs agui_server.py | open | contract cannot be refreshed from AgentCore |
| G19 no browser-level auth | open | the app itself is unauthenticated |

---

## Blocked on the backend

### G1 — There is no regenerate action in the contract
**Status:** blocked on backend · **Impact:** medium — the retry control is UI-only

`draftReview.actions` carries approve/reject-style values. Unlike a field *edit*,
which `node_9` accepts as `"Field Name: value"`, there is no reply shape meaning
"produce this again".

`cards/regenerateField.ts` therefore returns a locally-composed alternative after
a short delay, so the idle → retrying → comparing states can be built, reviewed
and demonstrated. It logs a console notice in development.

**The whole of the real implementation is the body of one function.** The card
awaits a promise of a string and does not care where it came from. When the
backend lands a regenerate path, replace that body and delete `draftAlternative`.

**Resolve by:** adding a regenerate path to the graph.

### G2 — The contract cannot say which fields are regenerable
**Status:** blocked on backend · **Impact:** low

Nothing in `FieldRow` distinguishes a value the agent wrote from one SolMan
supplied, so `REGENERABLE_KEYS` is a hard-coded list of two contract keys
(`description_of_change`, `reason_for_change`, both from
`generate_cr_fields_from_jira`).

That is exactly the client-side inference the contract exists to remove: it would
silently miss a third generated field, or offer retry on a field the agent cannot
regenerate.

**Resolve by:** adding `regenerable: true` to `FieldRow`, alongside the existing
`editable` and `lock_type`. Additive, so `CONTRACT_VERSION` would not move.

### G3 — "Cancel" has no meaning in the contract
**Status:** blocked on backend · **Impact:** low

Any response from the intake form routes to `node_1`; there is no "abandon"
value. Cancel currently clears the form locally, which is the least misleading
thing available — but it does not abandon anything, and a user may reasonably
expect it to.

**Resolve by:** a contract value the graph understands as abandonment.

### G4 — GxP compliance fields are editable with no lock reason
**Status:** blocked on backend · **Impact:** medium

`COMPLIANCE_LOCKED_FIELDS` omits the GxP fields, so GxP Relevant, SOX Impact,
Security Change, RICEF and SoD Ruleset arrive `editable` with no `lock_reason`
and render as editable. On a regulated path these are exactly the fields that
should not be freely editable.

**Resolve by:** adding them to `COMPLIANCE_LOCKED_FIELDS` with a reason string.

### G5 — `node_7` writes fabricated `object_id`s on embedding failure
**Status:** blocked on backend · **Impact:** medium

Filtered at the UI boundary so a fabricated identifier is never shown, but the
behaviour remains upstream and any other consumer of that state would display it.

**Resolve by:** failing the node instead of inventing an id.

### G6 — `meta.timestamp` is one string; the design colours it as two
**Status:** blocked on backend · **Impact:** cosmetic

The design gives the date and the time different colours (`#677489`, `#adb4c1`).
The contract sends a single pre-formatted display string. Splitting it would mean
parsing agent text, which is the coupling the contract exists to prevent.

**Resolve by:** sending `date` and `time` separately. Additive.

### G7 — Bulk CR is fully designed and has no contract
**Status:** blocked on backend · **Impact:** low while the feature is off

The bulk path has designed frames but no contract components. The mode stays
selectable and the graph answers with `featureComingSoon` — see the Step 5 notes.

### G8 — `draft_cycle_id` / `keep_current_label` have no designed treatment
**Status:** blocked on backend · **Impact:** unknown

`cycleIdPicker` can carry both, and no frame defines how they look. Rendered
minimally. Whether that path is real needs confirming before designing for it.

---

### G16 — Button labels on `crIntakeForm` have no contract props
**Status:** blocked on backend · **Impact:** low, recurring

Every word on that card comes from the agent except two: the action-row buttons.
The contract has no props for them, so they are the constants `SUBMIT_LABEL` and
`CANCEL_LABEL` in `cards/CrIntakeForm.tsx`.

The client renamed "Submit" to "Next" on the call of 2026-08-30. That was a
frontend release for a wording change, which is the wrong shape — the whole point
of the controlled-UI contract is that the agent owns the copy.

**Resolve by:** adding `submit_label` and `cancel_label` to `crIntakeFormProps`.
Additive, so `CONTRACT_VERSION` would not move. The two constants are then
deleted.

### G17 — Recommended CRs are ordered before Template, against the Figma frame
**Status:** open, deliberate · **Impact:** none, recorded for the design team

The frame puts Template ID above the recommended change requests.
`templateOrCrPicker` renders them the other way round, at the client's request on
2026-08-30: the recommendations are the answer most people want, and the template
is the fallback.

Recorded so the next person comparing this card against Figma finds an
explanation rather than assuming a mistake. Worth folding back into the design
file.

### G18 — `contract:pull` still needs a local `agui_server.py`
**Status:** open · **Impact:** low, until the contract changes

`npm run contract:pull` fetches `/api/ui-contract` from
`AGUI_API_BASE`, which was the standalone AG-UI host. The running app no longer
talks to it: AgentCore is the only runtime, and its data plane exposes only
`POST /invocations`.

So the contract snapshot can only be refreshed by someone who can still run the
backend locally. Everything else about the contract pipeline is unaffected —
`contract:gen` and `check:contract` work from the committed snapshot.

**Resolve by:** exposing the contract document through a `forwardedProps.lookup`
type, the same way the four data lookups now work, and pointing the script at
`/api/agent`.

### G19 — The application itself is unauthenticated
**Status:** open · **Impact:** high before any real deployment

The Azure AD credentials authenticate **this server to AgentCore**. They say
nothing about who is using the browser. Every route is still open to anyone who
can reach the host.

This is a different gap from the one the AgentCore work closed, and it is easy to
mistake one for the other now that the word "Azure" appears in the codebase.

**Resolve by:** MSAL in front of the app, matching `_ref/platform-fe`, plus a
session check in `src/proxy.ts`. The seam is narrow: all backend traffic already
passes through `src/app/api/agent/route.ts`.

### G15 — The backend keeps no envelope history per thread
**Status:** blocked on backend · **Impact:** medium

`AgentState.ui_component` holds the latest card only, so a conversation
transcript cannot be reconstructed from the agent. The frontend keeps its own
record in `sessionStorage`, per thread.

That survives a refresh and stays on the device, which is the right trade for
draft CR contents — but it does not survive a different browser or machine, and a
user who continues a change request from their laptop sees an empty conversation
above the live card.

**Resolve by:** keeping an ordered list of emitted `ui_component` envelopes per
thread, retrievable on reconnect. Additive; the frontend would prefer it to its
own copy and the storage fallback could stay as a cache.

**Raised with the backend team:** pending.

---

## Ours, scheduled

### G9 — Automated tests — CLOSED in Step 9
**Status:** closed · 73 tests across 4 files, enforced by `npm run verify` and CI

Covers envelope precedence and every failure branch, the transcript store
(including reconnect de-duplication and corrupt storage), all eight cards from
the backend's own fixtures, the lookup allow-list, the agent proxy's guards, and
the liveness/readiness split.

**Still uncovered, and worth knowing:** no browser-level end-to-end pass. The
transport is exercised through the scripted backend by hand at `/dev/session`,
not by an automated run. A Playwright pass over one full conversation would close
that; it needs a browser in CI, which is a DevOps conversation.

### G10 — `output: "standalone"` is not set
**Status:** open — owned by DevOps · **Impact:** low

Removed in Step 1 because the deployment procedure it requires does not exist
yet: the documented invocation needs `public/` and `.next/static/` copied into
the standalone directory, which belongs in a Dockerfile.

Containerisation was explicitly handed to the DevOps team, so this flag returns
with their image rather than being set here without the steps that make it work.

### G11 — No authentication
**Status:** scheduled · **Impact:** high before any real deployment

This is an AG-UI demo: there is no IdP, and every route is open. The seam is
deliberate and narrow — all backend traffic passes through
`src/app/api/agent/route.ts` and `src/app/api/lookup/[resource]/route.ts`, so a
token is attached in two files, not thirty call sites.

**Resolve by:** MSAL (matching `_ref/platform-fe`) plus a session check in
`src/proxy.ts`.

### G12 — No Johnson Text Light
**Status:** open · **Impact:** cosmetic, and a trap

The supplied font set has Display Light/Regular/Medium/Bold and Text
Regular/Medium/Bold. If a frame calls for Text Light, **raise it rather than
substituting a nearby weight** — a substitution is a silent deviation nobody
catches in review.

### G13 — The failed `submissionResult` treatment is inferred
**Status:** open · **Impact:** low

There is no frame for the failure variant of the submission result. Built from
the success frame with the danger tokens already in the system.

### G14 — The expanded field editor and the retry compare view have no frames
**Status:** open · **Impact:** low

Both were built from existing primitives — `SelectChip`, the field box geometry,
and the `draftReview` action-row button treatments — so they read as native
rather than invented. Worth a design pass if the feature stays.
