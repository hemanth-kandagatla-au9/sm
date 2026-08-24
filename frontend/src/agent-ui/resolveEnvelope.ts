/**
 * agent-ui/resolveEnvelope.ts
 *
 * Decides what to render from the two places a component envelope can arrive.
 *
 * ── Why there are two, and why the interrupt wins ────────────────────────────
 * Every HITL node in this graph calls `interrupt(ui)` with the component
 * envelope itself, *and* writes the same envelope to `AgentState.ui_component`,
 * which rides the AG-UI state channel.
 *
 * Those two are not equally reliable. The AG-UI interrupt contract specifies
 * that StateSnapshot is emitted *before* the interrupt-carrying RunFinished and
 * is deliberately **not** resent when a client reconnects to an already-pending
 * interrupt — so that replay-based and checkpoint-based resumption behave
 * identically. A transport reconnect while a card is on screen therefore
 * re-delivers the interrupt but no fresh snapshot.
 *
 * So: the interrupt value is the authoritative render source whenever one is
 * pending, and state is the fallback for everything else. Getting this backwards
 * produces a card that blanks or reverts on reconnect — the failure mode is
 * intermittent, which is the worst kind to debug later.
 *
 * @see https://docs.ag-ui.com/concepts/interrupts
 */
import { COMPONENT_NAMES, CONTRACT_VERSION, type ComponentName } from "./contract.generated";
import type { EnvelopeSource, Resolution } from "./types";

const NAMES = new Set<string>(COMPONENT_NAMES);

function isComponentName(value: string): value is ComponentName {
  return NAMES.has(value);
}

/** Narrow an unknown payload to the envelope shape, or say why it is not one. */
function readEnvelope(raw: unknown, source: EnvelopeSource): Resolution | null {
  if (raw == null) return null;

  // The interrupt value arrives as whatever the graph passed to interrupt().
  // A string means a node called interrupt("some prompt") without an envelope —
  // legal in LangGraph, meaningless to a registry-driven UI.
  if (typeof raw !== "object") {
    return { status: "malformed", source, reason: `expected an object, got ${typeof raw}` };
  }

  const env = raw as Record<string, unknown>;

  if (typeof env.name !== "string") {
    return { status: "malformed", source, reason: "envelope has no string `name`" };
  }
  if (typeof env.version !== "number") {
    return { status: "malformed", source, reason: `"${env.name}" has no numeric \`version\`` };
  }

  // Version is checked before the name: a future contract may rename components,
  // so an unknown name under an unknown version is a version problem, not a
  // registry problem, and the message should say so.
  if (env.version !== CONTRACT_VERSION) {
    return { status: "unsupported-version", source, version: env.version, name: env.name };
  }
  if (!isComponentName(env.name)) {
    return { status: "unknown-component", source, name: env.name };
  }
  if (env.props == null || typeof env.props !== "object") {
    return { status: "malformed", source, reason: `"${env.name}" has no \`props\` object` };
  }

  return { status: "ok", source, name: env.name, props: env.props };
}

export interface EnvelopeInputs {
  /** The raw value from the pending LangGraph interrupt, if one is open. */
  interruptValue?: unknown;
  /** `AgentState.ui_component` from the most recent state snapshot or delta. */
  stateComponent?: unknown;
}

export function resolveEnvelope({
  interruptValue,
  stateComponent,
}: EnvelopeInputs): Resolution {
  const fromInterrupt = readEnvelope(interruptValue, "interrupt");
  if (fromInterrupt) return fromInterrupt;

  const fromState = readEnvelope(stateComponent, "state");
  if (fromState) return fromState;

  return { status: "empty" };
}

/** Human-readable reason for a non-ok resolution, for the fallback card. */
export function explain(resolution: Resolution): string {
  switch (resolution.status) {
    case "ok":
      return "";
    case "empty":
      return "The agent has not selected a component.";
    case "unknown-component":
      return `The agent asked for "${resolution.name}", which this app does not know how to render.`;
    case "unsupported-version":
      return `The agent sent contract version ${resolution.version}; this app understands version ${CONTRACT_VERSION}.`;
    case "malformed":
      return `The agent sent something this app could not read: ${resolution.reason}.`;
  }
}
