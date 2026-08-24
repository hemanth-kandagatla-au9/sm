/**
 * cards/CrModeChoice.tsx — Figma 59646:14750. Contract component `crModeChoice`.
 *
 * The flow's entry point: Single vs Bulk. Selecting a mode answers immediately —
 * the design has no submit button on this card, and the graph is blocked on a
 * single `interrupt()` waiting for the mode string.
 *
 * ── Why bulk is selectable even when `enabled` is false ─────────────────────
 * `node_0_wait` routes on `mode == "bulk"` and never reads `enabled`. When bulk
 * is off, the graph answers with the `featureComingSoon` card — a designed
 * screen. Disabling the option client-side would make that screen unreachable
 * and replace a considered "available soon" message with a dead control.
 *
 * `enabled: false` is therefore informational, not a gate. See DECISIONS.md D19.
 */
"use client";

import { useState } from "react";
import type { AgentCardProps } from "@/agent-ui/types";
import { CardShell } from "./CardShell";
import { Radio } from "./Radio";
import { cn } from "@/lib/cn";

export function CrModeChoice({ props, respond, pending }: AgentCardProps<"crModeChoice">) {
  // Local only so the radio reflects the click before the graph resumes. The
  // agent remains the source of truth for what is on screen.
  const [selected, setSelected] = useState<string | null>(null);

  function choose(value: string) {
    if (!pending) return;
    setSelected(value);
    respond(value);
  }

  return (
    <CardShell meta={props.meta}>
      <p className="w-[25.4375rem] text-16 font-text font-medium leading-normal tracking-normal text-ink-900">
        {props.subtitle ?? props.title}
      </p>

      <div className="flex w-full flex-col gap-5" role="radiogroup" aria-label={props.title}>
        {props.modes.map((mode) => (
          <button
            key={mode.value}
            type="button"
            role="radio"
            aria-checked={selected === mode.value}
            disabled={!pending}
            onClick={() => choose(mode.value)}
            className={cn(
              "group/option flex items-center gap-1.5 text-left",
              !pending && "cursor-not-allowed opacity-60",
            )}
          >
            <Radio checked={selected === mode.value} disabled={!pending} />
            <span className="text-16 font-display font-medium leading-[1.2] text-ink-900 whitespace-nowrap">
              {mode.label}
            </span>
            {mode.description ? (
              <span className="text-16 font-display font-medium leading-[1.2] text-ink-400">
                {mode.description}
              </span>
            ) : null}
          </button>
        ))}
      </div>
    </CardShell>
  );
}
