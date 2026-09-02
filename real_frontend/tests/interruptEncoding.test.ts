import { describe, expect, it } from "vitest";
import { CONTRACT_VERSION } from "@/agent-ui/contract.generated";
import { FIXTURES } from "@/agent-ui/fixtures.generated";
import { resolveEnvelope } from "@/agent-ui/resolveEnvelope";
import { unwrapInterruptValue } from "@/agent-ui/useAgentSession";

/**
 * The backend JSON-encodes the interrupt value.
 *
 * `dump_json_safe()` in ag-ui-langgraph runs `json.dumps()` on any non-string
 * interrupt value, so `event.value` is a string containing the envelope rather
 * than the envelope itself.
 *
 * This is the single highest-consequence detail in the integration. Without the
 * unwrap, every card in every conversation resolves as `malformed` and the user
 * sees fallback cards from the first screen to the last — while a mock that
 * sends the object, as the protocol says it should, passes happily.
 */
const envelope = {
  version: CONTRACT_VERSION,
  name: "crModeChoice" as const,
  props: FIXTURES.crModeChoice,
};

describe("unwrapInterruptValue", () => {
  it("parses the encoded envelope back into an object", () => {
    expect(unwrapInterruptValue(JSON.stringify(envelope))).toEqual(envelope);
  });

  it("passes an already-decoded envelope through untouched", () => {
    // The protocol says it should arrive this way, and a future encoder fix
    // must not break the client.
    expect(unwrapInterruptValue(envelope)).toBe(envelope);
  });

  it("leaves a non-JSON string alone", () => {
    // interrupt("please confirm") is legal in LangGraph and meaningless to a
    // registry-driven UI. It must stay a string so it is reported as malformed.
    expect(unwrapInterruptValue("please confirm")).toBe("please confirm");
  });

  it("passes null and undefined through", () => {
    expect(unwrapInterruptValue(null)).toBeNull();
    expect(unwrapInterruptValue(undefined)).toBeUndefined();
  });
});

describe("the encoded envelope, end to end", () => {
  it("resolves to a renderable card", () => {
    const resolution = resolveEnvelope({
      interruptValue: unwrapInterruptValue(JSON.stringify(envelope)),
    });

    expect(resolution).toMatchObject({
      status: "ok",
      source: "interrupt",
      name: "crModeChoice",
    });
  });

  /** What the app did before the unwrap existed, kept as the counter-example. */
  it("resolves as malformed without the unwrap", () => {
    const resolution = resolveEnvelope({ interruptValue: JSON.stringify(envelope) });

    expect(resolution).toMatchObject({ status: "malformed" });
    expect(resolution).toHaveProperty("reason", expect.stringContaining("string"));
  });

  it("still reports a genuinely malformed string as malformed", () => {
    const resolution = resolveEnvelope({
      interruptValue: unwrapInterruptValue("please confirm"),
    });

    expect(resolution).toMatchObject({ status: "malformed" });
  });

  it("reports an encoded envelope with a bad version as a version problem", () => {
    const resolution = resolveEnvelope({
      interruptValue: unwrapInterruptValue(JSON.stringify({ ...envelope, version: 99 })),
    });

    expect(resolution).toMatchObject({ status: "unsupported-version", version: 99 });
  });
});
