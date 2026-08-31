import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Tip } from "@/ui/Tooltip";

/**
 * Tooltips exist where the meaning of a control is not fully on screen: an
 * icon-only button in the collapsed sidebar, or a label truncated to fit.
 *
 * The behaviour worth protecting is the keyboard one. A `title` attribute — the
 * obvious cheap alternative — does not appear on focus in most browsers, so the
 * people who most need to know what an unlabelled icon does are the ones it
 * fails. If that stops working, nothing visual would reveal it.
 */
describe("Tip", () => {
  it("shows on keyboard focus, not only on hover", async () => {
    render(
      <Tip label="Create Change Request">
        <button type="button">icon</button>
      </Tip>,
    );

    expect(screen.queryByRole("tooltip")).toBeNull();

    await userEvent.tab();
    expect(screen.getByRole("tooltip")).toHaveTextContent("Create Change Request");
  });

  it("dismisses on Escape", async () => {
    render(
      <Tip label="New chat">
        <button type="button">icon</button>
      </Tip>,
    );

    await userEvent.tab();
    expect(screen.getByRole("tooltip")).toBeInTheDocument();

    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  /**
   * A tooltip is a description, not a name. An icon-only trigger still needs its
   * own `aria-label`, and wrapping must not disturb it.
   */
  it("leaves the trigger's accessible name alone", () => {
    render(
      <Tip label="Some longer explanation">
        <button type="button" aria-label="New chat" />
      </Tip>,
    );

    expect(screen.getByRole("button", { name: "New chat" })).toBeInTheDocument();
  });

  it("renders nothing extra when disabled", async () => {
    render(
      <Tip label="Dashboard" disabled>
        <button type="button">Dashboard</button>
      </Tip>,
    );

    await userEvent.tab();
    // The rail passes `disabled` when expanded: the label is already beside the
    // icon, and a tooltip repeating visible text teaches people to ignore them.
    expect(screen.queryByRole("tooltip")).toBeNull();
  });
});
