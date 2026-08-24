/**
 * agent-ui/types.ts
 *
 * The hand-written half of the contract layer. Everything here describes how a
 * card is *used*; everything in contract.generated.ts describes what a card is
 * *given*.
 *
 * The rule this file exists to enforce: a card receives props and a way to
 * answer. It does not fetch, does not read a store, does not know about routing,
 * and does not know which transport delivered it. That constraint is what makes
 * this folder portable into the platform team's app later.
 */
import type { ComponentName, PropsByName } from "./contract.generated";

/**
 * Answer the agent's question. The value is round-tripped as the return value of
 * the LangGraph `interrupt(...)` the graph is blocked on.
 *
 * Draft approval sends the literal tokens `approve` / `reject`, never prose —
 * the graph's approval guard is a substring test that free text trips.
 */
export type Respond = (value: string) => void;

export interface AgentCardProps<K extends ComponentName> {
  props: PropsByName[K];
  respond: Respond;
  /**
   * True while the graph is genuinely blocked waiting on this card. False when
   * the card is being shown from state after the run moved on — a card rendered
   * from a stale snapshot must not look actionable.
   */
  pending: boolean;
}

export type AgentCard<K extends ComponentName> = React.ComponentType<AgentCardProps<K>>;

/**
 * Every contract component mapped to a card. The live `REGISTRY` is this type,
 * so adding a component to the contract without implementing it fails to
 * compile — which is the intended end state (DECISIONS.md D9).
 */
export type TotalRegistry = { [K in ComponentName]: AgentCard<K> };

/**
 * The looser form, still used by the host and the drift check: those must cope
 * with a registry that is missing a name, because the contract snapshot and the
 * running backend can disagree at deploy time. That is exactly the drift the
 * check exists to report.
 */
export type Registry = { [K in ComponentName]?: AgentCard<K> };

/** The envelope the agent puts on `AgentState.ui_component`. */
export interface AgentComponentEnvelope {
  version: number;
  name: string;
  props: Record<string, unknown>;
}

/** Where a rendered envelope came from. Surfaced in dev tooling, not in the UI. */
export type EnvelopeSource = "interrupt" | "state";

/**
 * The outcome of interpreting whatever the transport handed us. Every failure
 * mode is a named case rather than a null, because on a regulated approval path
 * a user must never be left staring at a blank panel wondering whether their
 * change request went through.
 */
export type Resolution =
  | { status: "ok"; source: EnvelopeSource; name: ComponentName; props: unknown }
  | { status: "empty" }
  | { status: "unknown-component"; source: EnvelopeSource; name: string }
  | { status: "unsupported-version"; source: EnvelopeSource; version: number; name: string }
  | { status: "malformed"; source: EnvelopeSource; reason: string };
