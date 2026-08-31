import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AgentComponentHost } from "@/agent-ui/AgentComponentHost";
import { COMPONENT_NAMES, CONTRACT_VERSION } from "@/agent-ui/contract.generated";
import { FIXTURES } from "@/agent-ui/fixtures.generated";
import { resolveEnvelope } from "@/agent-ui/resolveEnvelope";
import { REGISTRY } from "@/agent-ui/registry";
import type { TurnAnswer } from "@/agent-ui/types";

/**
 * Cards are exercised through the host, from the backend's own fixtures —
 * never by importing a card and passing hand-written props.
 *
 * Rendering a card directly would skip validation, the registry lookup and the
 * interrupt-versus-state precedence: the three places a real failure occurs. And
 * hand-written props test what someone assumed the backend sends rather than
 * what it does send.
 */
function renderCard(
  name: (typeof COMPONENT_NAMES)[number],
  opts: { respond?: (v: string, l?: string) => void; settled?: boolean; answer?: TurnAnswer } = {},
) {
  const envelope = { version: CONTRACT_VERSION, name, props: FIXTURES[name] };
  return render(
    <AgentComponentHost
      resolution={resolveEnvelope({ interruptValue: envelope })}
      respond={opts.respond ?? (() => {})}
      settled={opts.settled}
      answer={opts.answer}
    />,
  );
}

describe("the registry", () => {
  it("implements every component the agent can name", () => {
    for (const name of COMPONENT_NAMES) {
      expect(REGISTRY[name], `no card registered for ${name}`).toBeDefined();
    }
  });

  it("registers nothing the contract does not define", () => {
    const contract = new Set<string>(COMPONENT_NAMES);
    for (const name of Object.keys(REGISTRY)) {
      expect(contract.has(name), `${name} is registered but not in the contract`).toBe(true);
    }
  });
});

describe("every card, from the backend's own fixture", () => {
  it.each(COMPONENT_NAMES)("%s renders without a fallback", (name) => {
    const { container } = renderCard(name);
    // The fallback card marks itself. Its absence is the assertion.
    expect(container.querySelector("[data-agent-fallback]")).toBeNull();
    expect(container.textContent?.trim().length ?? 0).toBeGreaterThan(0);
  });

  /**
   * A settled turn is a historical record: nothing in it may answer the graph
   * again. Otherwise a scrolled-back transcript is a page of live approve
   * buttons.
   *
   * The assertion is on `respond`, not on the `disabled` attribute. Some
   * controls legitimately stay live on a settled card — "View details" on
   * `templateOrCrPicker` and the accordion "Details" on `draftReview` — because
   * reading the record is not the same act as answering it, which is the same
   * separation the design enforces between expanding an option and choosing it.
   * A first version of this test asserted `disabled` on everything and failed on
   * exactly those two.
   */
  it.each(COMPONENT_NAMES)("%s cannot answer once settled", async (name) => {
    const respond = vi.fn();
    const { container } = renderCard(name, { respond, settled: true });

    const controls = container.querySelectorAll("button, input, select, textarea");
    for (const el of controls) {
      if (el.hasAttribute("disabled") || el.getAttribute("aria-disabled") === "true") continue;
      await userEvent.click(el, { pointerEventsCheck: 0 });
    }

    expect(
      respond,
      `${name}: a settled card answered the graph after ${controls.length} clicks`,
    ).not.toHaveBeenCalled();
  });
});

describe("crModeChoice", () => {
  it("answers with the mode's value and its label", async () => {
    const respond = vi.fn();
    renderCard("crModeChoice", { respond });

    const single = FIXTURES.crModeChoice.modes[0]!;
    await userEvent.click(screen.getByRole("radio", { name: new RegExp(single.label, "i") }));

    expect(respond).toHaveBeenCalledWith(single.value, single.label);
  });

  /**
   * The contract sends `enabled: false` for bulk, and the card keeps it
   * clickable on purpose: `node_0_wait` routes on `mode == "bulk"` without
   * reading `enabled`, and answers with the featureComingSoon card. Disabling it
   * here would make a designed screen unreachable.
   */
  it("keeps a disabled-by-contract mode selectable", async () => {
    const respond = vi.fn();
    renderCard("crModeChoice", { respond });

    const bulk = FIXTURES.crModeChoice.modes.find((m) => m.enabled === false);
    expect(bulk, "the fixture no longer contains a disabled mode").toBeDefined();

    await userEvent.click(screen.getByRole("radio", { name: new RegExp(bulk!.label, "i") }));
    expect(respond).toHaveBeenCalledWith(bulk!.value, bulk!.label);
  });

  it("shows the settled answer as selected after a reload", () => {
    const single = FIXTURES.crModeChoice.modes[0]!;
    renderCard("crModeChoice", {
      settled: true,
      answer: { value: single.value, label: single.label, at: Date.now() },
    });

    expect(screen.getByRole("radio", { name: new RegExp(single.label, "i") })).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });
});

describe("draftReview", () => {
  /**
   * `cond_edge_b`'s approval guard is a substring test. "Submit for Approval"
   * contains no `approve`, so sending the label would silently fail to approve;
   * "I do not approve" contains one, so prose would approve by accident. The
   * card must send the token and show the label.
   */
  it("sends the action token, never its label", async () => {
    const respond = vi.fn();
    renderCard("draftReview", { respond });

    const actions = FIXTURES.draftReview.actions ?? [];
    expect(actions.length, "the fixture has no actions to test").toBeGreaterThan(0);

    const action = actions[0]!;
    await userEvent.click(screen.getByRole("button", { name: action.label }));

    expect(respond).toHaveBeenCalledWith(action.value, action.label);
    expect(respond.mock.calls[0]?.[0]).not.toBe(action.label);
  });
});

describe("submissionResult", () => {
  /**
   * `solman_write` can return success with a null CR id. Telling someone their
   * change request was created while giving them no identifier to reconcile
   * against is worse than telling them to check.
   */
  it("treats a success with no CR id as a failure", () => {
    const props = { ...FIXTURES.submissionResult, success: true, cr_id: null };
    const { container } = render(
      <AgentComponentHost
        resolution={resolveEnvelope({
          interruptValue: { version: CONTRACT_VERSION, name: "submissionResult", props },
        })}
        respond={() => {}}
      />,
    );

    const text = container.textContent ?? "";
    expect(text).toMatch(/solman/i);
    expect(within(container).queryByText(/^created$/i)).toBeNull();
  });
});

describe("the fallback card", () => {
  it("states the failure instead of rendering nothing", () => {
    const { container } = render(
      <AgentComponentHost
        resolution={resolveEnvelope({ interruptValue: "not an envelope" })}
        respond={() => {}}
      />,
    );

    expect(container.querySelector('[data-agent-fallback="malformed"]')).not.toBeNull();
    expect(screen.getByRole("alert").textContent).toMatch(/could not be displayed/i);
    // It must also tell the user their request is not lost.
    expect(screen.getByRole("alert").textContent).toMatch(/solman/i);
  });
});

describe("draftReview layout", () => {
  /**
   * An open section spans both columns, and the tiles after it reflow beneath.
   *
   * Before this, an expanded section kept its half-width column while its fields
   * stacked down one narrow side and the other column sat empty — the card grew
   * tall and half of it was whitespace. Asserted here because it is a layout
   * rule nobody would notice breaking until a screenshot review.
   */
  it("gives an opened section the full card width", async () => {
    const { container } = renderCard("draftReview");

    // Attribute match, not a class selector: `.md\:col-span-2` needs a
    // backslash escape that is easy to lose in transit, and losing it yields a
    // selector that quietly matches nothing rather than erroring.
    const spanning = () => container.querySelectorAll('[class*="col-span-2"]').length;
    expect(spanning(), "a section is spanning before anything was opened").toBe(0);

    const toggles = screen.getAllByRole("button", { expanded: false });
    expect(toggles.length, "no collapsible sections in the fixture").toBeGreaterThan(0);

    await userEvent.click(toggles[0]!);

    expect(spanning()).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { expanded: true })).toHaveLength(1);
  });

  it("returns to two columns when the section is closed again", async () => {
    const { container } = renderCard("draftReview");
    const toggle = screen.getAllByRole("button", { expanded: false })[0]!;

    await userEvent.click(toggle);
    await userEvent.click(screen.getAllByRole("button", { expanded: true })[0]!);

    expect(container.querySelectorAll('[class*="col-span-2"]')).toHaveLength(0);
  });
});
