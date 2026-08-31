import { beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { Transcript } from "@/shell/Transcript";
import { CONTRACT_VERSION } from "@/agent-ui/contract.generated";
import { FIXTURES } from "@/agent-ui/fixtures.generated";
import type { Turn } from "@/agent-ui/transcript";

/**
 * Where the transcript scrolls when something arrives.
 *
 * jsdom does no layout, so this asserts the *instruction* rather than the
 * resulting pixels — which is the part that regresses. The behaviour is
 * invisible in code review and only shows up as "the card opens halfway down",
 * which people report as a rendering bug rather than a scroll one.
 */
const turn = (i: number, name: keyof typeof FIXTURES, answered: boolean): Turn => ({
  id: String(i),
  envelope: {
    version: CONTRACT_VERSION,
    name,
    // A stored envelope is untyped by design — it crossed a transport boundary
    // and is re-validated on render. The cast mirrors that, rather than
    // pretending the transcript holds typed props.
    props: FIXTURES[name] as unknown as Record<string, unknown>,
  },
  ...(answered
    ? { answer: { value: "single", label: "Single Change Request", at: 1 } }
    : {}),
});

let scrollIntoView: ReturnType<typeof vi.fn>;

beforeEach(() => {
  scrollIntoView = vi.fn();
  // jsdom implements no scrollIntoView at all; without this the component throws.
  Element.prototype.scrollIntoView = scrollIntoView as unknown as Element["scrollIntoView"];
});

describe("Transcript scrolling", () => {
  /**
   * A draft review is taller than the viewport. Scrolling to the bottom — what a
   * chat normally does — opens it on its action buttons, with the title and the
   * fields already scrolled past and nothing to signal it.
   */
  it("brings a new question to the top of the view", () => {
    render(
      <Transcript
        turns={[turn(0, "crModeChoice", true), turn(1, "draftReview", false)]}
        respond={() => {}}
        userName="Kelvin Johnson"
      />,
    );

    expect(scrollIntoView).toHaveBeenCalledWith(
      expect.objectContaining({ block: "start" }),
    );
  });

  /** A reply is short, and what matters is seeing that it was sent. */
  it("scrolls to the bottom after the user answers", () => {
    render(
      <Transcript
        turns={[turn(0, "crModeChoice", true)]}
        respond={() => {}}
        userName="Kelvin Johnson"
      />,
    );

    expect(scrollIntoView).toHaveBeenCalledWith(
      expect.objectContaining({ block: "end" }),
    );
  });

  it("renders the user's label in the bubble, never the routing token", () => {
    const { container } = render(
      <Transcript
        turns={[turn(0, "crModeChoice", true)]}
        respond={() => {}}
        userName="Kelvin Johnson"
      />,
    );

    /*
     * Scoped to the reply bubble, found by its <time> element.
     *
     * The card above it legitimately contains the word "single" in the bulk
     * option's copy — "from a single upload" — so asserting over the whole
     * transcript proves nothing. A first version of this test did exactly that
     * and failed against correct code.
     */
    const bubble = container.querySelector("time")?.closest("div");
    expect(bubble, "no user reply bubble rendered").not.toBeNull();

    const text = bubble?.textContent ?? "";
    expect(text).toContain("Single Change Request");
    expect(text).toContain("Kelvin Johnson");
    // `single` is what the graph routes on. Echoing it back would show the user
    // routing internals instead of what they did.
    expect(text).not.toMatch(/\bsingle\b/);
  });
});
