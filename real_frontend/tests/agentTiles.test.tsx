import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AgentTiles } from "@/shell/Greeting";

/**
 * The landing screen's agent picker.
 *
 * CR/CO is the only agent wired up, and choosing it must reveal what it can do
 * rather than starting something unnamed — the client asked for the flow to be
 * reachable three ways (New Chat, the sidebar, and this tile), and all three
 * have to land on the same action.
 */
describe("AgentTiles", () => {
  it("does not start the agent until an action is chosen", async () => {
    const onStartCr = vi.fn();
    render(<AgentTiles onStartCr={onStartCr} />);

    await userEvent.click(screen.getByRole("button", { name: /Use CR\/CO Agent/i }));

    // Opening the agent is not the same as starting a change request.
    expect(onStartCr).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /Use CR\/CO Agent/i })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
  });

  it("starts the flow from the revealed action", async () => {
    const onStartCr = vi.fn();
    render(<AgentTiles onStartCr={onStartCr} />);

    expect(screen.queryByRole("button", { name: /Create Change Request/i })).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: /Use CR\/CO Agent/i }));
    await userEvent.click(screen.getByRole("button", { name: /Create Change Request/i }));

    expect(onStartCr).toHaveBeenCalledTimes(1);
  });

  it("closes again when the same tile is chosen twice", async () => {
    render(<AgentTiles onStartCr={() => {}} />);
    const tile = screen.getByRole("button", { name: /Use CR\/CO Agent/i });

    await userEvent.click(tile);
    await userEvent.click(tile);

    expect(tile).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("button", { name: /Create Change Request/i })).toBeNull();
  });

  /**
   * The other two tiles carry the design's chevron but open nothing yet. They
   * must not claim to be expandable to a screen reader — `aria-expanded` on a
   * control that never expands is a promise the UI does not keep.
   */
  it("does not announce the unwired tiles as expandable", () => {
    render(<AgentTiles onStartCr={() => {}} />);

    expect(screen.getByRole("button", { name: /Use SASA Agent/i })).not.toHaveAttribute(
      "aria-expanded",
    );
    expect(screen.getByRole("button", { name: /Workshop Assist/i })).not.toHaveAttribute(
      "aria-expanded",
    );
  });
});
