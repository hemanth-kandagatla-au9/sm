/**
 * cards/FieldRetry.tsx
 *
 * The retry states for a generated field: **loading**, then **compare**.
 *
 * A retry is not an edit. An edit is the user supplying text; a retry asks the
 * agent to write the value again. So the outcome is two candidates, not one
 * input — and the user picks. "Keep original" is a real choice here, not a
 * cancel: something new is on screen next to the old value.
 *
 * The two are visually distinguished the way the design already distinguishes
 * agent data from editable data: the original takes the locked treatment
 * (`field-disabled`, `ink-muted`) because it is not what you are being asked
 * about, and the candidate takes the active treatment.
 *
 * **No Figma frame** — assembled from the existing field-box geometry and the
 * small button treatments from `draftReview`'s action row. See DECISIONS.md G29.
 */
"use client";

import type { FieldRow } from "@/agent-ui/contract.generated";
import { Icon } from "@/shell/Icon";
import { cn } from "@/lib/cn";

export function FieldRetryLoading({ field }: { field: FieldRow }) {
  return (
    <div className="flex w-full flex-col gap-1">
      <p className="text-12 font-text capitalize text-ink-450">{field.label}</p>
      <div className="flex w-full items-center gap-3 rounded-md border border-brand-a24 bg-surface px-3 py-4">
        {/* `motion-safe` only — a spinner is decoration, not information. */}
        <span className="flex shrink-0 motion-safe:animate-spin">
          <Icon src="reset.svg" width={16} height={16} />
        </span>
        <p className="min-w-0 flex-1 text-12 font-text text-ink-450">
          Asking the agent for another {field.label.toLowerCase()}…
        </p>
      </div>
    </div>
  );
}

export function FieldRetryCompare({
  field,
  candidate,
  onKeepOriginal,
  onUseCandidate,
  onRetryAgain,
}: {
  field: FieldRow;
  candidate: string;
  onKeepOriginal: () => void;
  onUseCandidate: () => void;
  onRetryAgain: () => void;
}) {
  const original = field.value ?? "";
  const identical = candidate.trim() === original.trim();

  return (
    <div className="flex w-full flex-col gap-1">
      <p className="text-12 font-text capitalize text-ink-450">{field.label}</p>

      <div className="flex w-full flex-col gap-2 rounded-md border border-brand-a52 bg-surface p-3">
        {/* ── Original ──────────────────────────────────────────────────── */}
        <div className="flex w-full flex-col gap-1">
          <p className="text-10 font-text uppercase text-ink-450">Original</p>
          <div className="rounded-md border border-line bg-field-disabled px-3 py-2.5">
            <p className="text-12 font-text text-ink-muted">{original || "—"}</p>
          </div>
        </div>

        {/* ── Regenerated ───────────────────────────────────────────────── */}
        <div className="flex w-full flex-col gap-1">
          <p className="text-10 font-text uppercase text-brand">Regenerated</p>
          <div className="rounded-md border border-brand-a24 bg-surface px-3 py-2.5">
            <p className="text-12 font-text text-ink-900">{candidate || "—"}</p>
          </div>
          {identical ? (
            <p className="text-10 font-text text-ink-450">
              The agent produced the same text. Keeping the original changes nothing.
            </p>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line-soft pt-2">
          <p className="min-w-0 flex-1 text-10 font-text text-ink-450">
            Choosing the new one sends it back to the agent, which revalidates and re-presents the
            draft.
          </p>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={onRetryAgain}
              className="flex items-center gap-1.5 rounded-sm border border-line bg-surface px-2.5 py-1 text-10 font-text font-medium text-ink-600"
            >
              <Icon src="reset.svg" width={12} height={12} />
              Retry again
            </button>
            <button
              type="button"
              onClick={onKeepOriginal}
              className="rounded-sm border border-line bg-surface px-2.5 py-1 text-10 font-text font-medium text-ink-600"
            >
              Keep original
            </button>
            <button
              type="button"
              onClick={onUseCandidate}
              disabled={identical || !candidate.trim()}
              className={cn(
                "rounded-sm px-2.5 py-1 text-10 font-text font-medium text-surface",
                identical || !candidate.trim() ? "bg-disabled" : "bg-btn-primary",
              )}
            >
              Use this one
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
