"use client";

import * as RadixTooltip from "@radix-ui/react-tooltip";
import { cn } from "@/lib/cn";

/**
 * ui/Tooltip.tsx
 *
 * A tooltip for controls whose meaning is not fully on screen: an icon-only
 * button, or a label that has been truncated to fit.
 *
 * ── Why a dependency for this ───────────────────────────────────────────────
 * The zero-cost option is the `title` attribute, and it is not good enough here.
 * It does not appear on keyboard focus in most browsers, it is unreachable on
 * touch, its delay and position cannot be controlled, and it cannot be styled —
 * so the one thing a collapsed sidebar needs, "tell me what this icon is", is
 * exactly what it fails to do for anyone not using a mouse.
 *
 * Radix handles focus, escape-to-dismiss, portalling out of `overflow-clip`
 * ancestors, and collision-aware positioning. The sidebar and rail both clip
 * their overflow, so a hand-rolled absolutely-positioned div would be cut off by
 * the very container that made the tooltip necessary.
 *
 * ── On `aria-label` ─────────────────────────────────────────────────────────
 * A tooltip is not an accessible name. Radix wires the content up as a
 * description, so an icon-only trigger still needs its own `aria-label` — the
 * tooltip tells a sighted user what the icon means, and the label tells a screen
 * reader. Both, not either.
 */
export function Tip({
  label,
  children,
  side = "right",
  /** Skip rendering entirely — for text that is only sometimes truncated. */
  disabled = false,
}: {
  label: string;
  children: React.ReactNode;
  side?: "top" | "right" | "bottom" | "left";
  disabled?: boolean;
}) {
  if (disabled || !label) return <>{children}</>;

  return (
    <RadixTooltip.Provider
      // Long enough not to fire while the pointer crosses a row on its way
      // somewhere else; short enough to feel like an answer to a question.
      delayDuration={400}
      skipDelayDuration={200}
    >
      <RadixTooltip.Root>
        <RadixTooltip.Trigger asChild>{children}</RadixTooltip.Trigger>
        <RadixTooltip.Portal>
          <RadixTooltip.Content
            side={side}
            sideOffset={8}
            collisionPadding={8}
            className={cn(
              "z-50 max-w-[18rem] rounded-md bg-ink-800 px-2.5 py-1.5",
              "text-12 font-text text-surface shadow-card",
              // Radix sets these data attributes for the open/closed transition;
              // behind motion-safe so a reduced-motion preference gets no
              // animation at all rather than a faster one.
              "motion-safe:data-[state=delayed-open]:animate-in",
              "motion-safe:data-[state=delayed-open]:fade-in-0",
            )}
          >
            {label}
            <RadixTooltip.Arrow className="fill-ink-800" />
          </RadixTooltip.Content>
        </RadixTooltip.Portal>
      </RadixTooltip.Root>
    </RadixTooltip.Provider>
  );
}
