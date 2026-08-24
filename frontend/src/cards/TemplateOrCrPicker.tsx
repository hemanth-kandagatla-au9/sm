/**
 * cards/TemplateOrCrPicker.tsx — Figma 59556:15690.
 * Contract component `templateOrCrPicker`. Screen 2 of the flow.
 *
 * Two ways to seed the draft, and the design makes them exclusive with a literal
 * "OR" divider: a Template ID from a dropdown, or one of the agent's recommended
 * reference change requests. Either answers the interrupt on its own — there is
 * no submit button on this card.
 *
 * ── What the agent supplies, and what we must not invent ────────────────────
 * The reference options, their badges, and their expansion `details` all come
 * from `reference_options_from_baseline()`. Note in particular that placeholder
 * recommendations are **filtered server-side**: `node_7` writes fabricated
 * `object_id`s (`CR_0`…`CR_4`) when embedding fails, and the builder skips any
 * slot carrying an `error`. So a row reaching this card is a real CR. We must
 * not add rows, re-order them, or synthesise details — picking a baseline CR
 * determines every field of the resulting draft.
 */
"use client";

import { useState } from "react";
import type { AgentCardProps } from "@/agent-ui/types";
import type { OptionRow as OptionShape } from "@/agent-ui/contract.generated";
import { CardShell } from "./CardShell";
import { Field } from "./Field";
import { OptionRow } from "./OptionRow";
import { DetailsModal } from "./DetailsModal";

export function TemplateOrCrPicker({
  props,
  respond,
  pending,
}: AgentCardProps<"templateOrCrPicker">) {
  const [template, setTemplate] = useState(props.selected_template ?? "");
  const [reference, setReference] = useState(props.selected_reference ?? "");
  const [expanded, setExpanded] = useState<OptionShape | null>(null);
  const [answered, setAnswered] = useState(false);

  const disabled = !pending || answered;
  const options = props.reference_options ?? [];

  function choose(value: string, kind: "template" | "reference") {
    if (disabled || !value) return;
    setAnswered(true);
    if (kind === "template") {
      setTemplate(value);
      setReference("");
    } else {
      setReference(value);
      setTemplate("");
    }
    respond(value);
  }

  return (
    <CardShell meta={props.meta}>
      <div className="flex w-full flex-col justify-center gap-2">
        <p className="text-16 font-text font-medium text-ink-900">{props.title}</p>
        {props.subtitle ? (
          <p className="text-16 font-text text-ink-500">{props.subtitle}</p>
        ) : null}
      </div>

      <div className="flex w-full flex-col gap-4">
        <Field
          id="template_id"
          label={props.template_label ?? "Template ID"}
          required={props.template_optional === false}
          options={props.template_options ?? []}
          placeholder="Select Template ID"
          value={template}
          onChange={(v) => choose(v, "template")}
          disabled={disabled}
        />

        {/* The design's literal OR divider: two rules with the word between. */}
        {options.length ? (
          <div className="flex w-full items-center justify-center gap-4">
            <span className="h-px flex-1 bg-line-soft" />
            <span className="text-14 font-text font-medium text-ink-400">OR</span>
            <span className="h-px flex-1 bg-line-soft" />
          </div>
        ) : null}

        {options.length ? (
          <div className="flex w-full flex-col gap-3">
            <p className="text-14 font-text font-medium text-ink-label">
              {props.reference_label ?? "Reference Change Request ID"}
            </p>
            {/*
             * Two per row, as designed. `role="radiogroup"` rather than a native
             * fieldset because each row carries its own disclosure control.
             */}
            <div
              role="radiogroup"
              aria-label={props.reference_label ?? "Reference Change Request ID"}
              className="grid w-full grid-cols-1 gap-3 md:grid-cols-2"
            >
              {options.map((option) => (
                <OptionRow
                  key={option.value}
                  option={option}
                  selected={reference === option.value}
                  disabled={disabled}
                  onSelect={() => choose(option.value, "reference")}
                  onExpand={() => setExpanded(option)}
                />
              ))}
            </div>
          </div>
        ) : null}
      </div>

      {expanded ? (
        <DetailsModal
          title={expanded.label}
          details={expanded.details ?? []}
          onClose={() => setExpanded(null)}
        />
      ) : null}
    </CardShell>
  );
}
