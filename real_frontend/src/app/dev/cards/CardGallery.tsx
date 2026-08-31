"use client";

import { useEffect, useState } from "react";
import { AgentComponentHost } from "@/agent-ui/AgentComponentHost";
import {
  assertRegistryMatchesContract,
  contractDrift,
} from "@/agent-ui/assertRegistryMatchesContract";
import { COMPONENT_NAMES, CONTRACT_VERSION } from "@/agent-ui/contract.generated";
import { FIXTURES } from "@/agent-ui/fixtures.generated";
import { resolveEnvelope } from "@/agent-ui/resolveEnvelope";
import { RICH_DRAFT_REVIEW } from "./richDraft";

/**
 * Renders each component the way the transport will: as an envelope handed to
 * `resolveEnvelope`, then to the host. Not by importing a card directly.
 *
 * That matters. Calling `<DraftReview props={FIXTURES.draftReview} />` would
 * exercise the card but skip validation, the registry lookup and the
 * interrupt-versus-state precedence — the three places a real failure occurs.
 * Going through the same path as production means the gallery can be trusted.
 */
export function CardGallery() {
  const [answers, setAnswers] = useState<Record<string, string>>({});

  // Derived, not stored: the registry cannot change between renders, so holding
  // this in state would be a second copy of a fact that is already available.
  const drift = contractDrift();

  // The effect exists only for the console report — a side effect on an external
  // system, which is what an effect is actually for.
  useEffect(() => {
    assertRegistryMatchesContract();
  }, []);

  return (
    <main className="mx-auto max-w-4xl px-8 py-12">
      <h1 className="font-display text-24 font-medium text-ink-900">Card gallery</h1>
      <p className="mt-2 text-14 text-ink-500">
        Contract v{CONTRACT_VERSION} · {drift.implemented.length}/
        {COMPONENT_NAMES.length} components implemented. Every card below is rendered through
        <code className="mx-1 text-12">resolveEnvelope → AgentComponentHost</code>
        from the backend&rsquo;s own example payload — the same path the live
        transport takes.
      </p>

      <div className="mt-10 space-y-12">
        {COMPONENT_NAMES.map((name) => {
          // No cast: `interruptValue` is `unknown` by design, because in
          // production this value has crossed a transport boundary and has not
          // been validated yet. Casting here would test a path the real
          // transport never takes.
          const envelope = { version: CONTRACT_VERSION, name, props: FIXTURES[name] };
          const resolution = resolveEnvelope({ interruptValue: envelope });

          return (
            <section key={name}>
              <div className="mb-3 flex items-baseline gap-3">
                <h2 className="font-display text-20 font-medium text-ink-900">{name}</h2>
                {answers[name] !== undefined && (
                  <span className="rounded-chip bg-brand-a08 px-2 py-0.5 text-12 text-brand">
                    responded: {answers[name] || "(empty)"}
                  </span>
                )}
              </div>
              <AgentComponentHost
                resolution={resolution}
                respond={(value) => setAnswers((prev) => ({ ...prev, [name]: value }))}
              />
            </section>
          );
        })}
      </div>

      <section className="mt-16 border-t border-line pt-8">
        <h2 className="font-display text-20 font-medium text-ink-900">
          draftReview — full payload
        </h2>
        <p className="mt-2 mb-6 text-14 text-ink-500">
          The generated fixture carries one section with one field, which proves
          the card renders and says nothing about the layout. This is a
          development-only sample with the eight sections and the field mix of a
          real draft — open a section to see it take the full card width, and the
          tiles after it reflow beneath.
        </p>
        <AgentComponentHost
          resolution={resolveEnvelope({
            interruptValue: {
              version: CONTRACT_VERSION,
              name: "draftReview",
              props: RICH_DRAFT_REVIEW,
            },
          })}
          respond={(value) => setAnswers((prev) => ({ ...prev, richDraft: value }))}
        />
      </section>

      <section className="mt-16 border-t border-line pt-8">
        <h2 className="font-display text-20 font-medium text-ink-900">Failure paths</h2>
        <p className="mt-2 mb-6 text-14 text-ink-500">
          Every one of these is a state a real backend can produce. None of them
          may render a blank panel.
        </p>
        <div className="space-y-8">
          {[
            ["nothing selected", {}],
            [
              "unknown component",
              { interruptValue: { version: CONTRACT_VERSION, name: "somethingNew", props: {} } },
            ],
            [
              "future contract version",
              { interruptValue: { version: 99, name: "crModeChoice", props: {} } },
            ],
            ["interrupt was a bare string", { interruptValue: "please confirm" }],
            [
              "props missing",
              { interruptValue: { version: CONTRACT_VERSION, name: "crModeChoice" } },
            ],
          ].map(([label, input]) => (
            <div key={label as string}>
              <h3 className="mb-2 text-12 text-ink-400 uppercase">{label as string}</h3>
              <AgentComponentHost
                resolution={resolveEnvelope(input as Parameters<typeof resolveEnvelope>[0])}
                respond={() => {}}
              />
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
