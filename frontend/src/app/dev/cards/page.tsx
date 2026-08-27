/**
 * /dev/cards — the card review surface.
 *
 * Every implemented card, rendered through the real host against the backend's
 * own fixture. No agent, no transport, no backend. This is the page to hold
 * against Figma at each review gate.
 *
 * Each card is shown twice: once **pending** (the graph is blocked on it, so it
 * is interactive) and once **not pending** (rendered from stale state after the
 * run moved on, so it must not look actionable).
 */
"use client";

import { useState } from "react";
import { AgentComponentHost } from "@/agent-ui/AgentComponentHost";
import { CONTRACT_VERSION, type ComponentName } from "@/agent-ui/contract.generated";
import { FIXTURES } from "@/agent-ui/fixtures.generated";
import { resolveEnvelope } from "@/agent-ui/resolveEnvelope";
import { contractDrift } from "@/agent-ui/assertRegistryMatchesContract";
import type { CardMeta } from "@/agent-ui/contract.generated";

/**
 * The meta strip values shown in the design (Figma 59646:14760). The fixtures
 * carry `meta: null`, so without this the footer — which is a real part of every
 * card — would never appear for review.
 */
const DESIGN_META: CardMeta = {
  timestamp: "11th Feb, 26  21:13 pm",
  processing_time: "30 sec",
  tokens: 23,
  cost: "$00023",
};

/**
 * Some contract examples are deliberately minimal — `draftReview` ships one
 * section with one editable field, which exercises almost none of what the card
 * has to survive. These add the states that actually carry risk: a locked field
 * with a reason, an empty one, and more sections than fit a single row.
 *
 * They are *extra* cases, never replacements — the shipped fixture is still
 * rendered first, so drift against the real contract stays visible.
 */
const EXTRA_CASES: Partial<Record<ComponentName, { label: string; props: object }>> = {
  submissionResult: {
    // The agent says success; there is no CR ID. This must NOT read as success.
    label: 'status "success" with no cr_id — must render as a failure',
    props: { status: "success", message: "Successfully submitted.", cr_id: null },
  },
  draftReview: {
    label: "locked, empty and multi-section",
    props: {
      ...FIXTURES.draftReview,
      sections: [
        {
          name: "Details",
          fields: [
            { key: "zzfld00000v_cus", label: "Risk", value: "Low", editable: true, field_type: "dropdown", allowed_values: ["Low", "Medium", "High"], empty: false },
            { key: "status_adtnl", label: "Status", value: "In Development", editable: false, lock_type: "system_readonly", lock_reason: "Set by SolMan and cannot be changed through this agent.", empty: false },
          ],
        },
        {
          name: "Request for Change Scope",
          fields: [
            // Long enough to exercise the textarea path — this is the case the
            // edit affordance exists for.
            { key: "description_of_change", label: "Description of Change", value: "Update the treasury posting rule set so month-end accruals post to the correct GL account, and adjust the downstream reconciliation job to match.", editable: true, empty: false },
            { key: "reason_for_change", label: "Reason for change", value: "Config change to the treasury posting rules.", editable: true, empty: false },
            { key: "gxp_relevant", label: "GxP Relevant", value: "", editable: true, empty: true },
          ],
        },
        { name: "Approval", fields: [{ key: "aprv_proc_adtnl", label: "Approval Process", value: "Standard", editable: false, lock_type: "compliance_locked", lock_reason: "Locked by compliance policy.", empty: false }] },
        { name: "Functional Areas", fields: [] },
      ],
    },
  },
};

function CardCase({
  name,
  meta,
  pending,
  propsOverride,
}: {
  name: ComponentName;
  meta: CardMeta | null;
  pending: boolean;
  propsOverride?: object;
}) {
  const [answer, setAnswer] = useState<string | null>(null);

  const envelope = {
    version: CONTRACT_VERSION,
    name,
    props: { ...(propsOverride ?? FIXTURES[name]), meta },
  };

  // `pending` is derived from where the envelope came from: an open interrupt
  // means the graph is blocked, state alone means it is not.
  const resolution = resolveEnvelope(
    pending ? { interruptValue: envelope } : { stateComponent: envelope },
  );

  return (
    <div>
      <div className="mb-3 flex items-baseline gap-3">
        <span className="text-12 font-text font-medium uppercase text-ink-400">
          {pending ? "pending — interactive" : "from state — inert"}
        </span>
        {answer ? (
          <span className="rounded-chip bg-chip-green px-2 py-0.5 text-10 font-text text-ink-800">
            responded: {answer}
          </span>
        ) : null}
      </div>
      <AgentComponentHost resolution={resolution} respond={setAnswer} />
    </div>
  );
}

export default function CardsPage() {
  const drift = contractDrift();
  const implemented = drift.implemented as ComponentName[];

  return (
    <main className="min-h-screen bg-linear-to-t from-canvas-from to-canvas-to px-10 py-12">
      <header className="mb-10">
        <h1 className="text-64 font-display font-bold text-ink-900">
          Agent{" "}
          <span className="bg-linear-to-bl from-brand-grad-from to-brand-grad-to bg-clip-text text-transparent">
            cards
          </span>
        </h1>
        <p className="mt-4 text-24 font-text leading-normal tracking-normal text-ink-500">
          {implemented.length} of {implemented.length + drift.unimplemented.length} built, rendered
          from the contract&rsquo;s own fixtures.
        </p>
      </header>

      {implemented.length === 0 ? (
        <p className="text-16 font-text text-ink-500">No cards implemented yet.</p>
      ) : null}

      <div className="space-y-16">
        {implemented.map((name) => (
          <section key={name}>
            <h2 className="text-24 font-display font-medium text-ink-900">{name}</h2>
            <div className="mb-8 mt-1 h-px w-full bg-line" />
            <div className="space-y-10">
              <CardCase name={name} meta={DESIGN_META} pending />
              {EXTRA_CASES[name] ? (
                <div>
                  <p className="mb-3 text-12 font-text font-medium uppercase text-ink-400">
                    also — {EXTRA_CASES[name]!.label}
                  </p>
                  <CardCase name={name} meta={DESIGN_META} pending propsOverride={EXTRA_CASES[name]!.props} />
                </div>
              ) : null}
              <CardCase name={name} meta={null} pending={false} />
            </div>
          </section>
        ))}
      </div>

      {drift.unimplemented.length ? (
        <section className="mt-16">
          <h2 className="text-24 font-display font-medium text-ink-900">Still to build</h2>
          <div className="mb-6 mt-1 h-px w-full bg-line" />
          <div className="flex flex-wrap gap-2">
            {drift.unimplemented.map((n) => (
              <span
                key={n}
                className="rounded-chip border border-line bg-surface px-3 py-1 text-12 font-text text-ink-500"
              >
                {n}
              </span>
            ))}
          </div>
        </section>
      ) : null}
    </main>
  );
}
