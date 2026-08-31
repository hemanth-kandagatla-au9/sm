/**
 * cards/CycleIdPicker.tsx — Figma 59568:10257. Contract component `cycleIdPicker`.
 * Screen 3 of the flow: pick the deployment cycle.
 *
 * An agent message followed by cycle chips. Selecting one answers the interrupt
 * immediately — like `templateOrCrPicker`, this card has no submit button.
 *
 * The design lays the chips out four per row. That is a *consequence* of the
 * chips' natural width at the card's width, not a rule, so this wraps rather
 * than forcing a four-column grid — a longer cycle name would otherwise be
 * clipped or blow the card out.
 *
 * `draft_cycle_id` + `keep_current_label` are contract props with no frame in
 * the design set. When the agent sends both, the current cycle is offered as an
 * extra chip; when it does not, nothing renders. Rendering only what the agent
 * sends keeps this honest either way. See DECISIONS.md G20.
 */
"use client";

import { useState } from "react";
import type { AgentCardProps } from "@/agent-ui/types";
import { CardShell } from "./CardShell";
import { SelectChip } from "./SelectChip";

export function CycleIdPicker({ props, respond, pending, answer }: AgentCardProps<"cycleIdPicker">) {
  const [selected, setSelected] = useState<string | null>(answer?.value ?? null);
  const disabled = !pending || selected !== null;

  function choose(value: string, label?: string) {
    if (disabled) return;
    setSelected(value);
    respond(value, label ?? value);
  }

  const keepCurrent =
    props.draft_cycle_id && props.keep_current_label
      ? { label: props.keep_current_label, value: props.draft_cycle_id }
      : null;

  return (
    <CardShell meta={props.meta}>
      <div className="flex w-full flex-col items-start gap-4">
        <p className="w-full text-16 font-text font-medium leading-normal text-ink-900">
          {props.message}
        </p>

        <div
          role="radiogroup"
          aria-label="Deployment cycle"
          className="flex flex-wrap items-start gap-3"
        >
          {keepCurrent ? (
            <SelectChip
              label={keepCurrent.label}
              selected={selected === keepCurrent.value}
              disabled={disabled}
              onSelect={() => choose(keepCurrent.value)}
            />
          ) : null}

          {props.options.map((option) => (
            <SelectChip
              key={option.value}
              label={option.label}
              selected={selected === option.value}
              disabled={disabled || option.disabled}
              onSelect={() => choose(option.value)}
            />
          ))}
        </div>
      </div>
    </CardShell>
  );
}
