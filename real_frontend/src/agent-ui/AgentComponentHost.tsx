/**
 * agent-ui/AgentComponentHost.tsx
 *
 * The single place a card is chosen and rendered.
 *
 * The host does no stage-sniffing. It never inspects props to work out which
 * screen this is — no `labels.includes("Similarity score:")`, no
 * `options.some(o => o.value === "approve")`. The agent names the component; the
 * host looks it up. If a heuristic ever seems necessary here, the fix belongs in
 * the backend's ui_contract.py instead.
 */
"use client";

import type { ComponentName, PropsByName } from "./contract.generated";
import type { AgentCard, Registry, Resolution, Respond, TurnAnswer } from "./types";
import { REGISTRY } from "./registry";
import { FallbackCard } from "./FallbackCard";

export interface AgentComponentHostProps {
  resolution: Resolution;
  respond: Respond;
  /** Swappable so the dev gallery can render against a subset. */
  registry?: Registry;
  /**
   * Set for a turn that has already been answered. Passed straight through to
   * the card, which uses it to show what was chosen — see `TurnAnswer`.
   */
  answer?: TurnAnswer;
  /**
   * Forces a settled turn to render inert even when the resolution came from an
   * interrupt. An earlier turn in the transcript is not answerable, regardless
   * of how its envelope originally arrived.
   */
  settled?: boolean;
}

export function AgentComponentHost({
  resolution,
  respond,
  registry = REGISTRY,
  answer,
  settled = false,
}: AgentComponentHostProps) {
  if (resolution.status !== "ok") {
    return <FallbackCard resolution={resolution} />;
  }

  const name = resolution.name;
  const Card = registry[name] as AgentCard<ComponentName> | undefined;

  if (!Card) {
    // Unreachable with the live registry, which is total (D9) — the name has
    // already been validated against COMPONENT_NAMES, so a card exists for it.
    // Still handled, because the host accepts a registry override and because a
    // gap here must degrade to a stated failure rather than a blank panel.
    return <FallbackCard resolution={{ status: "unknown-component", source: resolution.source, name }} />;
  }

  // The cast is confined to this one line. `resolution.props` is `unknown`
  // because it crossed a transport boundary; the contract guarantees it matches
  // PropsByName[name] for a name that passed validation, and there is no way to
  // express "validated at runtime" to the compiler without re-deriving the
  // schemas here. Everything downstream of this line is fully typed.
  const props = resolution.props as PropsByName[ComponentName];

  return (
    <Card
      props={props}
      respond={respond}
      pending={!settled && resolution.source === "interrupt"}
      answer={answer}
    />
  );
}
