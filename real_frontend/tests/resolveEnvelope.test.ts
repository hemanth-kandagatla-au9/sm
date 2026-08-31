import { describe, expect, it } from "vitest";
import { CONTRACT_VERSION, COMPONENT_NAMES } from "@/agent-ui/contract.generated";
import { explain, resolveEnvelope } from "@/agent-ui/resolveEnvelope";

/**
 * The envelope resolver is the highest-value thing in this repo to test.
 *
 * It decides what the user sees, from data that crossed a network boundary, and
 * every one of its branches corresponds to a real backend behaviour. Its most
 * important rule — interrupt beats state — is invisible in normal operation and
 * only shows up as an intermittent blank card on reconnect.
 */
/*
 * `version` is explicitly `number`. Inferring it from the default would narrow
 * it to the literal `1` — CONTRACT_VERSION is `as const` — and the version
 * mismatch tests below could not be written at all.
 */
const envelope = (name: string, props: unknown = {}, version: number = CONTRACT_VERSION) => ({
  version,
  name,
  props,
});

describe("resolveEnvelope", () => {
  it("resolves a valid envelope from the interrupt", () => {
    const result = resolveEnvelope({ interruptValue: envelope("crModeChoice", { title: "x" }) });
    expect(result).toMatchObject({ status: "ok", source: "interrupt", name: "crModeChoice" });
  });

  it("falls back to state when no interrupt is open", () => {
    const result = resolveEnvelope({ stateComponent: envelope("draftReview") });
    expect(result).toMatchObject({ status: "ok", source: "state", name: "draftReview" });
  });

  /**
   * The rule that exists because AG-UI does NOT re-send a state snapshot when a
   * client reconnects to a pending interrupt. Reading state first would render a
   * stale card — and only ever on reconnect, which is the worst kind of bug to
   * find later.
   */
  it("prefers a pending interrupt over agent state", () => {
    const result = resolveEnvelope({
      interruptValue: envelope("fieldPrompt"),
      stateComponent: envelope("submissionResult"),
    });
    expect(result).toMatchObject({ status: "ok", source: "interrupt", name: "fieldPrompt" });
  });

  it("reports empty when neither source has anything", () => {
    expect(resolveEnvelope({})).toEqual({ status: "empty" });
    expect(resolveEnvelope({ interruptValue: null, stateComponent: null })).toEqual({
      status: "empty",
    });
  });

  it("rejects a component this app cannot render", () => {
    const result = resolveEnvelope({ interruptValue: envelope("riskAssessment") });
    expect(result).toMatchObject({ status: "unknown-component", name: "riskAssessment" });
  });

  /**
   * Version is checked BEFORE name on purpose: a future contract may rename
   * components, so an unknown name under an unknown version is a version
   * problem, and the message the user sees should say so.
   */
  it("reports a version mismatch even when the name is also unknown", () => {
    const result = resolveEnvelope({
      interruptValue: envelope("somethingFromTheFuture", {}, CONTRACT_VERSION + 1),
    });
    expect(result).toMatchObject({ status: "unsupported-version", version: CONTRACT_VERSION + 1 });
  });

  it("rejects a bare string interrupt", () => {
    // Legal in LangGraph — interrupt("please confirm") — and meaningless here.
    const result = resolveEnvelope({ interruptValue: "please confirm" });
    expect(result).toMatchObject({ status: "malformed" });
    expect(result).toHaveProperty("reason", expect.stringContaining("string"));
  });

  it("rejects an envelope with no props object", () => {
    const result = resolveEnvelope({
      interruptValue: { version: CONTRACT_VERSION, name: "crModeChoice" },
    });
    expect(result).toMatchObject({ status: "malformed" });
  });

  it("rejects envelopes missing name or version", () => {
    expect(resolveEnvelope({ interruptValue: { version: 1, props: {} } })).toMatchObject({
      status: "malformed",
    });
    expect(
      resolveEnvelope({ interruptValue: { name: "crModeChoice", props: {} } }),
    ).toMatchObject({ status: "malformed" });
  });

  it("accepts every component name in the contract", () => {
    for (const name of COMPONENT_NAMES) {
      expect(resolveEnvelope({ interruptValue: envelope(name) })).toMatchObject({
        status: "ok",
        name,
      });
    }
  });
});

describe("explain", () => {
  /**
   * Every non-ok resolution must produce a message. A blank explanation would
   * render a fallback card that says nothing, which is the failure the fallback
   * card exists to prevent.
   */
  it("gives a non-empty message for every failure", () => {
    const failures = [
      resolveEnvelope({}),
      resolveEnvelope({ interruptValue: envelope("nope") }),
      resolveEnvelope({ interruptValue: envelope("crModeChoice", {}, 99) }),
      resolveEnvelope({ interruptValue: "text" }),
    ];
    for (const f of failures) {
      expect(explain(f).length).toBeGreaterThan(10);
    }
  });

  it("says nothing for a successful resolution", () => {
    expect(explain(resolveEnvelope({ interruptValue: envelope("crModeChoice") }))).toBe("");
  });
});
