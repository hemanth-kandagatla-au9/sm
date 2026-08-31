import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, beforeEach } from "vitest";

/**
 * sessionStorage is real in jsdom, and it persists across tests in a file.
 * The transcript store also holds module-level state, so both are cleared
 * between tests — otherwise a test passes or fails depending on what ran first.
 */
beforeEach(() => {
  window.sessionStorage.clear();
});

afterEach(() => {
  cleanup();
});

/**
 * jsdom implements no `ResizeObserver`, and Radix measures the tooltip arrow
 * with one. Without this, any component containing a tooltip throws on mount.
 *
 * A no-op is the right stub rather than a real implementation: jsdom does no
 * layout, so every measurement would be zero anyway. Nothing here asserts on
 * size — only on what is announced and what is focusable — so an observer that
 * never fires changes no outcome.
 */
class NoopResizeObserver implements ResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

globalThis.ResizeObserver ??= NoopResizeObserver;
