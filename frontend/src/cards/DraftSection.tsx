/**
 * cards/DraftSection.tsx — Figma component set "Project details" (59481:7277).
 *
 * One section of the draft, as an inline accordion. Collapsed it is a 54px tile;
 * expanded it keeps the same shell and grows a field list, with the chevron
 * flipped (`-scale-y-100` in the design).
 *
 * ── The field treatments ────────────────────────────────────────────────────
 * The design gives two, and they line up exactly with the contract's `editable`
 * and `lock_type`:
 *
 *   editable   white fill, radius 8, black value, **pencil** icon
 *   locked     `field-disabled` fill, radius 16, `ink-muted` value, no icon
 *
 * The absent icon is the point — a locked field offers no affordance to change
 * it, rather than offering one that does nothing.
 *
 * ── Two ways to change a value ──────────────────────────────────────────────
 * **Edit** (pencil) — the user writes the text. `node_9_hitl_wait` tests each
 * reply with `_looks_like_field_update_message` and routes anything shaped
 * `"Field Name: value"` to update parsing, so an edit is this turn's answer.
 *
 * **Retry** (circular arrow, on generated fields only) — the *agent* writes the
 * text again. The result is two candidates, and the user picks. Currently
 * stubbed; see `regenerateField.ts`.
 *
 * Either way the change is a turn, not a local save: the agent revalidates and
 * re-presents the draft. See DECISIONS.md D35 and D36.
 */
"use client";

import { useEffect, useRef, useState } from "react";
import type { FieldRow } from "@/agent-ui/contract.generated";
import { Icon } from "@/shell/Icon";
import { SelectChip } from "./SelectChip";
import { FieldRetryCompare, FieldRetryLoading } from "./FieldRetry";
import { isRegenerable } from "./regenerateField";
import { cn } from "@/lib/cn";

/** Above this, a value gets a textarea rather than a single-line input. */
const LONG_VALUE = 60;

/**
 * What a field is currently doing. At most one field across the whole card may
 * have an activity — there is one response channel and one answer per turn.
 */
export type FieldActivity =
  | { kind: "edit" }
  | { kind: "retry-loading" }
  | { kind: "retry-compare"; candidate: string };

/**
 * The editor is a separate component, mounted only while a field is being
 * edited. Mounting is what seeds the draft from the field's current value —
 * so there is no effect syncing props into state, and no window in which the
 * two disagree.
 */
function FieldEditor({
  field,
  onCancel,
  onSubmit,
}: {
  field: FieldRow;
  onCancel: () => void;
  onSubmit: (value: string) => void;
}) {
  const original = field.value ?? "";
  const [draft, setDraft] = useState(original);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const choices = field.allowed_values ?? [];
  const isChoice = choices.length > 0;
  const isLong = original.length > LONG_VALUE;
  const changed = draft.trim() !== original.trim() && draft.trim().length > 0;

  return (
    <div className="flex w-full flex-col gap-1">
      <p className="text-12 font-text capitalize text-ink-450">{field.label}</p>

      <div className="flex w-full flex-col gap-2 rounded-md border border-brand-a52 bg-surface px-3 py-3">
        {isChoice ? (
          // A field with allowed_values gets chips rather than a native select —
          // the same control the cycle picker uses, and the values SolMan will
          // actually accept are visible instead of hidden behind a menu.
          <div role="radiogroup" aria-label={field.label} className="flex flex-wrap gap-2">
            {choices.map((choice) => (
              <SelectChip
                key={choice}
                label={choice}
                selected={draft === choice}
                onSelect={() => setDraft(choice)}
              />
            ))}
          </div>
        ) : isLong ? (
          <textarea
            ref={inputRef as React.RefObject<HTMLTextAreaElement>}
            value={draft}
            rows={4}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") onCancel();
            }}
            aria-label={field.label}
            className="w-full resize-y bg-transparent text-12 font-text leading-relaxed text-ink-900 outline-none"
          />
        ) : (
          <input
            ref={inputRef as React.RefObject<HTMLInputElement>}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && changed) onSubmit(draft.trim());
              if (e.key === "Escape") onCancel();
            }}
            aria-label={field.label}
            className="w-full bg-transparent text-12 font-text text-ink-900 outline-none"
          />
        )}

        <div className="flex items-center justify-between gap-3 border-t border-line-soft pt-2">
          <p className="min-w-0 flex-1 text-10 font-text text-ink-450">
            Sends <span className="text-ink-900">{field.label}</span> back to the agent, which
            revalidates and re-presents the draft.
          </p>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="rounded-sm border border-line bg-surface px-2.5 py-1 text-10 font-text font-medium text-ink-600"
            >
              Keep original
            </button>
            <button
              type="button"
              onClick={() => onSubmit(draft.trim())}
              disabled={!changed}
              className={cn(
                "rounded-sm px-2.5 py-1 text-10 font-text font-medium text-surface",
                changed ? "bg-btn-primary" : "bg-disabled",
              )}
            >
              Update draft
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function DraftField({
  field,
  activity,
  disabled,
  onStartEdit,
  onStartRetry,
  onCancel,
  onSubmitValue,
}: {
  field: FieldRow;
  activity: FieldActivity | null;
  disabled: boolean;
  onStartEdit: () => void;
  onStartRetry: () => void;
  onCancel: () => void;
  onSubmitValue: (value: string) => void;
}) {
  const locked = field.editable === false || field.lock_type != null;
  const value = field.empty ? "—" : field.value;

  if (activity?.kind === "edit") {
    return <FieldEditor field={field} onCancel={onCancel} onSubmit={onSubmitValue} />;
  }
  if (activity?.kind === "retry-loading") {
    return <FieldRetryLoading field={field} />;
  }
  if (activity?.kind === "retry-compare") {
    return (
      <FieldRetryCompare
        field={field}
        candidate={activity.candidate}
        onKeepOriginal={onCancel}
        onUseCandidate={() => onSubmitValue(activity.candidate)}
        onRetryAgain={onStartRetry}
      />
    );
  }

  return (
    <div className="flex w-full flex-col gap-1">
      <p className="text-12 font-text capitalize text-ink-450">{field.label}</p>

      <div
        className={cn(
          "flex w-full items-center justify-center gap-10 overflow-clip border border-line px-3",
          locked ? "rounded-xl bg-field-disabled py-6" : "rounded-md bg-surface py-4",
        )}
      >
        <div className="flex min-w-0 flex-1 items-center justify-between gap-3">
          <p
            className={cn(
              // No `capitalize` here, though the design has it. It is right for a
              // short enum value ("Low", "In Development") and wrong for a
              // sentence — it title-cases every word of a description the agent
              // wrote. Copy is the backend's; the frontend renders it as sent.
              // See DECISIONS.md G27.
              "min-w-0 flex-1 text-12 font-text",
              locked ? "text-ink-muted" : "text-ink-900",
              field.empty && "text-ink-400",
            )}
          >
            {value}
          </p>

          {!locked ? (
            <span className="flex shrink-0 items-center gap-2">
              {/* Retry only where the agent authored the value. */}
              {isRegenerable(field) ? (
                <button
                  type="button"
                  onClick={onStartRetry}
                  disabled={disabled}
                  aria-label={`Regenerate ${field.label}`}
                  title={`Ask the agent for another ${field.label.toLowerCase()}`}
                  className="disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Icon src="reset.svg" width={16} height={16} />
                </button>
              ) : null}
              <button
                type="button"
                onClick={onStartEdit}
                disabled={disabled}
                aria-label={`Edit ${field.label}`}
                className="disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Icon src="field-edit.svg" width={16} height={16} />
              </button>
            </span>
          ) : null}
        </div>
      </div>

      {field.lock_reason ? (
        <p className="text-10 font-text text-ink-450">{field.lock_reason}</p>
      ) : null}
    </div>
  );
}

export function DraftSection({
  name,
  fields,
  open,
  onToggle,
  activeKey,
  activity,
  disabled,
  onStartEdit,
  onStartRetry,
  onCancel,
  onSubmitValue,
}: {
  name: string;
  fields: FieldRow[];
  open: boolean;
  onToggle: () => void;
  /** The one field across the whole card that is busy, if any. */
  activeKey: string | null;
  activity: FieldActivity | null;
  disabled: boolean;
  onStartEdit: (key: string) => void;
  onStartRetry: (field: FieldRow) => void;
  onCancel: () => void;
  onSubmitValue: (field: FieldRow, value: string) => void;
}) {
  const activeHere = fields.some((f) => f.key === activeKey);

  return (
    <div
      className={cn(
        "flex flex-col items-start justify-center overflow-clip rounded-lg border bg-option-bg px-5",
        open ? "gap-3 pb-5" : "h-[3.375rem]",
        activeHere ? "border-brand-a24" : "border-line-soft",
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex h-11 w-full shrink-0 items-center justify-between"
      >
        <span className="text-16 font-text font-medium capitalize text-ink-label whitespace-nowrap">
          {name}
        </span>
        <span className={cn("flex items-center justify-center", open && "-scale-y-100")}>
          <Icon src="section-chevron.svg" width={24} height={24} />
        </span>
      </button>

      {open ? (
        <div className="flex w-full flex-col gap-2">
          {fields.map((field) => (
            <DraftField
              key={field.key}
              field={field}
              activity={activeKey === field.key ? activity : null}
              // While one field is busy, the others cannot start — one turn,
              // one answer.
              disabled={disabled || (activeKey !== null && activeKey !== field.key)}
              onStartEdit={() => onStartEdit(field.key)}
              onStartRetry={() => onStartRetry(field)}
              onCancel={onCancel}
              onSubmitValue={(value) => onSubmitValue(field, value)}
            />
          ))}
          {fields.length === 0 ? (
            <p className="text-12 font-text text-ink-450">No fields in this section.</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
