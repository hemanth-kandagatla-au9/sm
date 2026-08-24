/**
 * cards/DraftReview.tsx — Figma 59571:11519. Contract component `draftReview`.
 * Screen 4 — the approval checkpoint, and the most consequential card in the flow.
 *
 * Sections render as a two-column grid of accordion tiles. Opening one shows its
 * fields; `DraftSection` handles the two field treatments and the lock reasons.
 *
 * ── Actions send literal tokens ─────────────────────────────────────────────
 * The buttons send `option.value` verbatim — `approve`, `reject` — never their
 * label. `cond_edge_b`'s approval guard is a **substring test**, which free text
 * trips: a response of "Submit for Approval" contains no "approve", while a
 * response of "I do not approve" contains one. Sending the token is the only
 * safe option, and it is why the card never derives a value from a label.
 *
 * ── What this card does not do ──────────────────────────────────────────────
 * It does not edit. The contract defines no action for submitting a field
 * change — `actions` carries only approve/reject-style values — so edits go
 * through the composer as free text, which `node_10` validates. The editable
 * treatment is therefore an accurate *description* of what the agent will accept,
 * not a control. See G23.
 */
"use client";

import { useState } from "react";
import type { AgentCardProps } from "@/agent-ui/types";
import { CardShell } from "./CardShell";
import { DraftSection } from "./DraftSection";
import { cn } from "@/lib/cn";

/**
 * Button treatments, in the order the design places them (59616:13505–13508).
 * The last action is the primary; a destructive-sounding one is the soft-danger
 * secondary; anything else is the plain secondary.
 */
function actionClass(index: number, total: number, value: string) {
  const isPrimary = index === total - 1;
  const isDanger = /reject|cancel|discard/i.test(value);
  if (isPrimary) return "bg-btn-primary text-surface";
  if (isDanger) return "border border-line bg-surface text-ink-600";
  return "border border-danger-soft-line bg-danger-soft-bg text-danger-soft-text";
}

export function DraftReview({ props, respond, pending }: AgentCardProps<"draftReview">) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [answered, setAnswered] = useState(false);
  const disabled = !pending || answered;

  function toggle(name: string) {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  function act(value: string) {
    if (disabled) return;
    setAnswered(true);
    respond(value);
  }

  const actions = props.actions ?? [];

  return (
    <CardShell meta={props.meta}>
      <div className="flex w-full flex-col items-start gap-4">
        <div className="flex w-full flex-col justify-center gap-2">
          <p className="text-16 font-text font-medium leading-normal text-ink-900">
            {props.title}
          </p>
          {props.subtitle ? (
            <p className="text-16 font-text leading-normal text-ink-400">{props.subtitle}</p>
          ) : null}
        </div>

        <div className="grid w-full grid-cols-1 gap-3 md:grid-cols-2">
          {props.sections.map((section) => (
            <DraftSection
              key={section.name}
              name={section.name}
              fields={section.fields}
              open={open.has(section.name)}
              onToggle={() => toggle(section.name)}
            />
          ))}
        </div>

        {props.notices?.length ? (
          <ul className="flex w-full flex-col gap-1">
            {props.notices.map((notice, i) => (
              <li key={i} className="text-12 font-text text-warning">
                {notice}
              </li>
            ))}
          </ul>
        ) : null}

        <div className="flex w-full flex-col items-start justify-center gap-4">
          {props.confirm_text || props.question_text ? (
            <p className="w-full text-16 font-text font-medium leading-normal text-ink-400">
              {props.confirm_text}
              {props.question_text ? (
                <>
                  <br />
                  <span className="text-ink-900">{props.question_text}</span>
                </>
              ) : null}
            </p>
          ) : null}

          {actions.length ? (
            <div className="flex w-full items-start gap-3">
              {actions.map((action, i) => (
                <button
                  key={action.value}
                  type="button"
                  disabled={disabled || action.disabled}
                  onClick={() => act(action.value)}
                  className={cn(
                    "relative flex h-10 min-w-0 flex-1 items-center justify-center gap-2 overflow-clip rounded-md px-3 py-2",
                    "text-16 font-text font-medium whitespace-nowrap",
                    actionClass(i, actions.length, action.value),
                    disabled && "cursor-not-allowed opacity-60",
                  )}
                >
                  {action.label}
                  {i === actions.length - 1 ? (
                    <span
                      aria-hidden
                      className="pointer-events-none absolute inset-0 rounded-[inherit] shadow-inset-glow"
                    />
                  ) : null}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </CardShell>
  );
}
