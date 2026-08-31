/**
 * cards/Field.tsx — Figma component set "Frame 1707478497" (57410:88003).
 *
 * One input, nine designed states. They differ only in border colour, helper
 * colour, fill and trailing adornment, so they are one component with a `state`
 * prop rather than nine components:
 *
 *   default    border `line`                       — resting
 *   hover      border `brand-a12`                  — pointer over the field
 *   disabled   border `line`, fill `field-disabled` — inert (Figma calls this
 *                                                     variant "default", lower-case)
 *   error      border + helper `error`             — server-side validation
 *   missing    border + helper `warning`           — expected but absent
 *   verified   border + helper `success`           — looked up and confirmed
 *   dropdown   border `line`, chevron — opens the panel in `Select`
 *
 * Geometry is identical across all of them: 55px tall, 24px horizontal padding,
 * 16px radius, label 14/500 above at 6px gap, helper 12/400 below.
 *
 * This is a **presentational** component. It does no fetching, no debouncing and
 * no validation — those live in the card that owns the form, because the rules
 * are the agent's, not the input's.
 */
"use client";

import { useCallback, useEffect, useRef } from "react";
import { cn } from "@/lib/cn";
import { Icon } from "@/ui/Icon";
import { Select } from "./Select";

export type FieldState = "default" | "disabled" | "error" | "missing" | "verified";

/**
 * The trailing icon each state carries, exported from Figma with its colour
 * baked in — `field-error` is `#d01400`, `field-verified` is `#0b7929`.
 *
 * `default` and `disabled` are deliberately absent. The component set defines an
 * `icon/info` for them, but on the real form instances that layer is toggled
 * **off** (verified via the REST API, which reports `visible: false`). Rendering
 * it because the component set has it would put an icon on screen that the
 * design hides.
 *
 * `missing` reuses the info glyph — that is what the Missing variant instantiates;
 * only its border and helper turn amber.
 */
const STATE_ICON: Partial<Record<FieldState, string>> = {
  error: "field-error.svg",
  verified: "field-verified.svg",
  missing: "field-info.svg",
};

const BORDER: Record<FieldState, string> = {
  default: "border-line hover:border-brand-a12",
  disabled: "border-line",
  error: "border-error",
  missing: "border-warning",
  verified: "border-success",
};

const HELPER: Record<FieldState, string> = {
  default: "text-ink-600",
  disabled: "text-ink-600",
  error: "text-error",
  missing: "text-warning",
  verified: "text-success",
};

export interface FieldProps {
  label: string;
  /** Renders the red asterisk the design puts after a required label. */
  required?: boolean;
  value: string;
  onChange?: (value: string) => void;
  /**
   * Receives the field's current value from the event, not from render state.
   * A blur can land before React has re-rendered with the latest keystroke, and
   * a handler that closed over the previous value would act on stale input —
   * which is exactly the case the Jira lookup's blur rule has to get right.
   */
  onBlur?: (value: string) => void;
  placeholder?: string;
  state?: FieldState;
  /** Helper line under the field. Colour follows `state`. */
  helper?: string | null;
  disabled?: boolean;
  /** Right-hand adornment — chevron, spinner, tick, warning. */
  adornment?: React.ReactNode;
  /** Badge to the right of the label, e.g. the AI-suggestion marker. */
  labelBadge?: React.ReactNode;
  /** Present → renders the designed dropdown panel instead of a text input. */
  options?: string[] | null;
  /**
   * Renders a textarea that grows with its content instead of a single-line
   * input.
   *
   * For `Reason For Change` and `Description Of Change`: both routinely hold a
   * paragraph, and a one-line input shows a paragraph through a slot. People
   * cannot proof-read what they cannot see, and this text ends up in a change
   * request that someone approves.
   */
  multiline?: boolean;
  id?: string;
}

export function Field({
  label,
  required,
  value,
  onChange,
  onBlur,
  placeholder,
  state = "default",
  helper,
  disabled,
  adornment,
  labelBadge,
  options,
  multiline,
  id,
}: FieldProps) {
  const effective: FieldState = disabled ? "disabled" : state;
  const describedBy = helper ? `${id}-helper` : undefined;

  // Text fields only — a dropdown draws its own chevron inside `Select`.
  // An explicit `adornment` still overrides.
  const stateIcon = STATE_ICON[effective];
  const trailing =
    adornment ?? (stateIcon ? <Icon src={stateIcon} width={16} height={16} /> : null);

  return (
    <div className="flex w-full flex-col gap-1.5">
      <div className="flex w-full items-center justify-between gap-1.5">
        <label htmlFor={id} className="text-14 font-text font-medium text-ink-label">
          {label}
          {required ? <span className="text-brand"> *</span> : null}
        </label>
        {labelBadge}
      </div>

      {/*
       * A dropdown owns its own box, because opening it turns that box into the
       * panel (Figma 59527:10623) rather than floating a popover beside it.
       * Nesting it inside this wrapper would give it two borders.
       */}
      {options ? (
        <Select
          id={id}
          value={value}
          options={options}
          placeholder={placeholder}
          disabled={disabled}
          borderClass={BORDER[effective]}
          onChange={(v) => onChange?.(v)}
          describedBy={describedBy}
        />
      ) : (
        <div
          className={cn(
            "flex h-[3.4375rem] w-full items-center justify-between gap-10 rounded-xl border px-6 transition-colors",
            BORDER[effective],
            effective === "disabled" ? "bg-field-disabled" : "bg-surface",
            // The designed box is a fixed 55px. A growing textarea needs it to
            // start there and grow, so the height becomes a minimum and the
            // trailing icon aligns to the first line rather than the middle.
            multiline && "h-auto min-h-[3.4375rem] items-start py-4",
          )}
        >
          {multiline ? (
            <AutoTextarea
              id={id}
              value={value}
              disabled={disabled}
              placeholder={placeholder}
              onChange={(v) => onChange?.(v)}
              onBlur={(v) => onBlur?.(v)}
              describedBy={describedBy}
              invalid={effective === "error"}
            />
          ) : (
            <input
              id={id}
              value={value}
              disabled={disabled}
              placeholder={placeholder}
              onChange={(e) => onChange?.(e.target.value)}
              onBlur={(e) => onBlur?.(e.target.value)}
              aria-describedby={describedBy}
              aria-invalid={effective === "error" || undefined}
              className={cn(
                "min-w-0 flex-1 bg-transparent text-16 font-text text-ink-900 outline-none placeholder:text-ink-400",
                disabled && "cursor-not-allowed",
              )}
            />
          )}
          {trailing ? <span className="flex shrink-0 items-center">{trailing}</span> : null}
        </div>
      )}

      {helper ? (
        <p id={describedBy} className={cn("text-12 font-text", HELPER[effective])}>
          {helper}
        </p>
      ) : null}
    </div>
  );
}

/**
 * A textarea that grows with its content and never scrolls internally.
 *
 * The height is set from `scrollHeight` on every change, after resetting to
 * `auto` — without the reset the box only ever grows, because `scrollHeight` of
 * an already-tall element never reports a smaller value.
 *
 * `field-sizing: content` does this in CSS with no JavaScript, and is not yet
 * broadly enough supported to rely on for a field people type paragraphs into.
 */
function AutoTextarea({
  id,
  value,
  disabled,
  placeholder,
  onChange,
  onBlur,
  describedBy,
  invalid,
}: {
  id?: string;
  value: string;
  disabled?: boolean;
  placeholder?: string;
  onChange: (value: string) => void;
  onBlur: (value: string) => void;
  describedBy?: string;
  invalid?: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  const resize = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, []);

  // Also on mount and whenever the value arrives from outside — the Jira lookup
  // fills these two fields, and text that appears without a keystroke must size
  // the box just the same.
  useEffect(resize, [resize, value]);

  return (
    <textarea
      id={id}
      ref={ref}
      rows={1}
      value={value}
      disabled={disabled}
      placeholder={placeholder}
      onChange={(e) => {
        onChange(e.target.value);
        resize();
      }}
      onBlur={(e) => onBlur(e.target.value)}
      aria-describedby={describedBy}
      aria-invalid={invalid || undefined}
      className={cn(
        "min-w-0 flex-1 resize-none overflow-hidden bg-transparent text-16 font-text leading-6 text-ink-900 outline-none placeholder:text-ink-400",
        disabled && "cursor-not-allowed",
      )}
    />
  );
}
