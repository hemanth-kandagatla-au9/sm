/**
 * cards/FieldPrompt.tsx — Contract component `fieldPrompt`.
 *
 * The agent's generic ask, emitted by `node_3_request_information` when
 * something is missing — a platform, a target system, whatever the graph needs
 * next. Because it is generic, it has **no dedicated frame** in the design set.
 *
 * It is built on the `crModeChoice` frame (59646:14750), which is the designed
 * instance of exactly this shape: a message, then a radio list, in the standard
 * card shell. That is a mapping onto an existing designed pattern rather than an
 * invention — but it is still a mapping, so it is logged as G25.
 *
 * `allow_free_text` adds an input. The shell composer can already answer this
 * card (it resumes on the same channel), but a card that says "or type your
 * reply" and offers nowhere to type is worse than one that does — and in the
 * gallery there is no composer at all.
 */
"use client";

import { useState } from "react";
import type { AgentCardProps } from "@/agent-ui/types";
import { CardShell } from "./CardShell";
import { Radio } from "./Radio";
import { cn } from "@/lib/cn";

export function FieldPrompt({ props, respond, pending }: AgentCardProps<"fieldPrompt">) {
  const [selected, setSelected] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [answered, setAnswered] = useState(false);

  const disabled = !pending || answered;
  const options = props.options ?? [];

  function answer(value: string) {
    const trimmed = value.trim();
    if (disabled || !trimmed) return;
    setAnswered(true);
    respond(trimmed);
  }

  return (
    <CardShell meta={props.meta}>
      <div className="flex w-full flex-col items-start gap-5">
        <div className="flex w-full flex-col gap-2">
          {props.title ? (
            <p className="text-16 font-text font-medium text-ink-900">{props.title}</p>
          ) : null}
          <p className="w-full text-16 font-text font-medium leading-normal text-ink-900">
            {props.message}
          </p>
        </div>

        {options.length ? (
          <div role="radiogroup" aria-label={props.title ?? props.message} className="flex w-full flex-col gap-5">
            {options.map((option) => (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={selected === option.value}
                disabled={disabled || option.disabled}
                onClick={() => {
                  setSelected(option.value);
                  answer(option.value);
                }}
                className={cn(
                  "group/option flex items-center gap-1.5 text-left",
                  (disabled || option.disabled) && "cursor-not-allowed opacity-60",
                )}
              >
                <Radio checked={selected === option.value} disabled={disabled} />
                <span className="text-16 font-display font-medium leading-[1.2] text-ink-900 whitespace-nowrap">
                  {option.label}
                </span>
                {option.badge ? (
                  <span className="text-16 font-display font-medium leading-[1.2] text-ink-400">
                    {option.badge}
                  </span>
                ) : null}
              </button>
            ))}
          </div>
        ) : null}

        {props.allow_free_text !== false ? (
          <div className="flex w-full items-center gap-3">
            <input
              value={text}
              disabled={disabled}
              placeholder={props.placeholder ?? "Type your reply…"}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  answer(text);
                }
              }}
              aria-label={props.message}
              className="h-[3.4375rem] min-w-0 flex-1 rounded-xl border border-line bg-surface px-6 text-16 font-text text-ink-900 outline-none transition-colors placeholder:text-ink-400 hover:border-brand-a12 disabled:cursor-not-allowed disabled:bg-field-disabled"
            />
            <button
              type="button"
              onClick={() => answer(text)}
              disabled={disabled || !text.trim()}
              className={cn(
                "relative flex h-10 shrink-0 items-center justify-center overflow-clip rounded-md px-3 py-2",
                "text-16 font-text font-medium text-surface",
                disabled || !text.trim() ? "bg-disabled" : "bg-btn-primary",
              )}
            >
              Send
              <span
                aria-hidden
                className="pointer-events-none absolute inset-0 rounded-[inherit] shadow-inset-glow"
              />
            </button>
          </div>
        ) : null}
      </div>
    </CardShell>
  );
}
