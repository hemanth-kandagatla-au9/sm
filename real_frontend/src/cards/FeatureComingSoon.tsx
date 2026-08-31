/**
 * cards/FeatureComingSoon.tsx — Contract component `featureComingSoon`.
 *
 * What the agent answers with when Bulk CR is requested while
 * `BULK_CR_ENABLED = False`. Reaching it at all depends on the mode choice
 * staying clickable — see D19.
 *
 * **No designed frame.** The Figma set contains a complete Bulk CR flow
 * (`59637:15091`), which is what exists *instead of* a coming-soon screen — the
 * design was drawn for the world where Bulk shipped. So this card is assembled
 * from established parts: the standard shell, the standard message treatment,
 * and the secondary button from `draftReview`'s action row. Logged as G26.
 *
 * `back_label` returns to the mode choice. `node_0_wait` accepts **any** response
 * from this card and re-renders `crModeChoice`, so the value sent does not
 * matter — but it sends the label rather than an empty string, because a
 * transcript reading "back" is more use to whoever debugs this later than one
 * reading "".
 */
"use client";

import { useState } from "react";
import type { AgentCardProps } from "@/agent-ui/types";
import { CardShell } from "./CardShell";
import { cn } from "@/lib/cn";

export function FeatureComingSoon({
  props,
  respond,
  pending,
}: AgentCardProps<"featureComingSoon">) {
  const [answered, setAnswered] = useState(false);
  const disabled = !pending || answered;
  const backLabel = props.back_label ?? "Back";

  return (
    <CardShell meta={props.meta}>
      <div className="flex w-full flex-col items-start gap-4">
        <div className="flex w-full flex-col gap-2">
          <p className="text-16 font-text font-medium text-ink-900">{props.title}</p>
          <p className="w-full text-16 font-text leading-normal text-ink-400">{props.message}</p>
        </div>

        <button
          type="button"
          disabled={disabled}
          onClick={() => {
            setAnswered(true);
            respond(backLabel);
          }}
          className={cn(
            "flex h-10 items-center justify-center gap-2 rounded-md border border-line bg-surface px-3 py-2",
            "text-16 font-text font-medium text-ink-600 whitespace-nowrap",
            disabled && "cursor-not-allowed opacity-60",
          )}
        >
          {backLabel}
        </button>
      </div>
    </CardShell>
  );
}
