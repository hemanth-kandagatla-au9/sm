/**
 * /dev/contract — the Step 2 review surface.
 *
 * Proves three things without a backend running:
 *   1. every component in the contract is accounted for,
 *   2. the host renders the right thing for each,
 *   3. every failure mode degrades to a visible card rather than a blank panel.
 */
"use client";

import { useEffect } from "react";
import { AgentComponentHost } from "@/agent-ui/AgentComponentHost";
import { COMPONENT_NAMES, CONTRACT_VERSION } from "@/agent-ui/contract.generated";
import { FIXTURES } from "@/agent-ui/fixtures.generated";
import { resolveEnvelope } from "@/agent-ui/resolveEnvelope";
import {
  assertRegistryMatchesContract,
  contractDrift,
} from "@/agent-ui/assertRegistryMatchesContract";

/** Deliberately broken envelopes, one per failure mode the host must survive. */
const FAILURE_CASES: { title: string; note: string; input: unknown }[] = [
  {
    title: "Unknown component",
    note: "Backend deployed a component this app has not registered.",
    input: { version: CONTRACT_VERSION, name: "riskMatrixCard", props: {} },
  },
  {
    title: "Unsupported version",
    note: "Backend bumped the contract; this app has not caught up.",
    input: { version: 99, name: "draftReview", props: {} },
  },
  {
    title: "Malformed — no props",
    note: "Envelope arrived without a props object.",
    input: { version: CONTRACT_VERSION, name: "draftReview" },
  },
  {
    title: "Malformed — bare string",
    note: "A node called interrupt(\"...\") without an envelope.",
    input: "Please pick a deployment cycle",
  },
  {
    title: "Empty",
    note: "No interrupt pending and no ui_component on state.",
    input: null,
  },
];

function Pill({ tone, children }: { tone: "ok" | "warn" | "bad"; children: React.ReactNode }) {
  const cls =
    tone === "ok"
      ? "bg-chip-green text-ink-800"
      : tone === "warn"
        ? "bg-chip-amber text-ink-800"
        : "bg-brand text-white";
  return (
    <span className={`rounded-chip px-2 py-0.5 text-10 font-text font-medium ${cls}`}>
      {children}
    </span>
  );
}

export default function ContractPage() {
  // Pure — safe to compute during render.
  const drift = contractDrift();

  // The console report is a side effect, so it stays in an effect. This is the
  // same check the real app runs at startup.
  useEffect(() => {
    assertRegistryMatchesContract();
  }, []);

  return (
    <main className="min-h-screen bg-linear-to-t from-canvas-from to-canvas-to px-10 py-12">
      <header className="mb-10">
        <h1 className="text-64 font-display font-bold text-ink-900">
          Contract{" "}
          <span className="bg-linear-to-bl from-brand-grad-from to-brand-grad-to bg-clip-text text-transparent">
            layer
          </span>
        </h1>
        <p className="mt-4 text-24 font-text leading-normal tracking-normal text-ink-500">
          Version {CONTRACT_VERSION} · {COMPONENT_NAMES.length} components · generated from the
          backend&rsquo;s own contract document.
        </p>
      </header>

      <section className="mb-12 rounded-xl border border-line bg-surface p-6 shadow-card">
        <h2 className="text-24 font-display font-medium text-ink-900">Registry drift</h2>
        <p className="mt-1 text-16 font-text text-ink-500">
          Compares what the agent can emit against what this app can render.
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <Pill tone="ok">{drift.implemented.length} implemented</Pill>
          <Pill tone={drift.unimplemented.length ? "warn" : "ok"}>{drift.unimplemented.length} not built yet</Pill>
          {drift.orphaned.length ? (
            <Pill tone="bad">{drift.orphaned.length} orphaned — drift</Pill>
          ) : (
            <Pill tone="ok">0 orphaned</Pill>
          )}
        </div>
      </section>

      <section className="mb-14">
        <h2 className="text-24 font-display font-medium text-ink-900">
          Every component, rendered from its fixture
        </h2>
        <div className="mt-1 mb-6 h-px w-full bg-line" />
        <div className="space-y-8">
          {COMPONENT_NAMES.map((name) => {
            const envelope = { version: CONTRACT_VERSION, name, props: FIXTURES[name] };
            const resolution = resolveEnvelope({ interruptValue: envelope });
            return (
              <div key={name}>
                <p className="mb-3 text-12 font-text font-medium uppercase text-ink-400">{name}</p>
                <AgentComponentHost
                  resolution={resolution}
                  respond={(v) => console.info(`[dev] ${name} responded:`, v)}
                />
              </div>
            );
          })}
        </div>
      </section>

      <section className="mb-14">
        <h2 className="text-24 font-display font-medium text-ink-900">Failure modes</h2>
        <p className="mt-1 text-16 font-text text-ink-500">
          None of these may render a blank panel.
        </p>
        <div className="mt-1 mb-6 h-px w-full bg-line" />
        <div className="space-y-8">
          {FAILURE_CASES.map((c) => (
            <div key={c.title}>
              <p className="text-12 font-text font-medium uppercase text-ink-400">{c.title}</p>
              <p className="mb-3 text-12 font-text text-ink-500">{c.note}</p>
              <AgentComponentHost
                resolution={resolveEnvelope({ interruptValue: c.input })}
                respond={() => {}}
              />
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-24 font-display font-medium text-ink-900">Source precedence</h2>
        <p className="mt-1 text-16 font-text text-ink-500">
          A pending interrupt outranks state, because AG-UI does not resend a state snapshot when a
          client reconnects to an already-open interrupt.
        </p>
        <div className="mt-1 mb-6 h-px w-full bg-line" />
        <div className="rounded-lg border border-line bg-surface divide-y divide-line-faint">
          {(
            [
              ["interrupt + state", { version: 1, name: "fieldPrompt", props: FIXTURES.fieldPrompt }, { version: 1, name: "draftReview", props: FIXTURES.draftReview }],
              ["state only", undefined, { version: 1, name: "draftReview", props: FIXTURES.draftReview }],
              ["interrupt only", { version: 1, name: "fieldPrompt", props: FIXTURES.fieldPrompt }, undefined],
            ] as const
          ).map(([label, interruptValue, stateComponent]) => {
            const r = resolveEnvelope({ interruptValue, stateComponent });
            return (
              <div key={label} className="flex items-center gap-6 p-4">
                <span className="w-44 shrink-0 text-12 font-text font-medium text-ink-900">
                  {label}
                </span>
                <span className="text-12 font-text text-ink-500">
                  → renders{" "}
                  <strong className="text-ink-900">
                    {r.status === "ok" ? r.name : r.status}
                  </strong>{" "}
                  {r.status === "ok" ? `from ${r.source}` : ""}
                </span>
              </div>
            );
          })}
        </div>
      </section>
    </main>
  );
}
