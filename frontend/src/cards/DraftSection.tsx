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
 *   editable   white fill, radius 8, black value, trailing 16px icon
 *   locked     `field-disabled` fill, radius 16, `ink-muted` value, no icon
 *
 * The absent icon is the point — a locked field offers no affordance to change
 * it, rather than offering one that does nothing.
 *
 * ── Lock reasons ────────────────────────────────────────────────────────────
 * The contract carries `lock_reason` and the integration doc is emphatic about
 * it: "A field that silently refuses to change reads as a bug; a stated reason
 * makes it a visible control." The design has **no slot** for it, so it is
 * rendered as a line beneath the field. Logged as G22 — a deliberate addition,
 * not an oversight.
 */
"use client";

import type { FieldRow } from "@/agent-ui/contract.generated";
import { Icon } from "@/shell/Icon";
import { cn } from "@/lib/cn";

function DraftField({ field }: { field: FieldRow }) {
  const locked = field.editable === false || field.lock_type != null;
  // `empty: true` means no value will be submitted — worth showing as absence
  // rather than as an empty box the reader might mistake for a rendering bug.
  const value = field.empty ? "—" : field.value;

  return (
    <div className="flex w-full flex-col gap-1">
      <p className="text-12 font-text capitalize text-ink-450">{field.label}</p>

      <div
        className={cn(
          "flex w-full items-center justify-center gap-10 overflow-clip border border-line px-3",
          locked
            ? "rounded-xl bg-field-disabled py-6"
            : "rounded-md bg-surface py-4",
        )}
      >
        <div className="flex min-w-0 flex-1 items-center justify-between">
          <p
            className={cn(
              "min-w-0 flex-1 text-12 font-text capitalize",
              locked ? "text-ink-muted" : "text-ink-900",
              field.empty && "text-ink-400",
            )}
          >
            {value}
          </p>
          {/* Only an editable field gets the affordance. */}
          {!locked ? <Icon src="field-info.svg" width={16} height={16} /> : null}
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
}: {
  name: string;
  fields: FieldRow[];
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-start justify-center overflow-clip rounded-lg border border-line-soft bg-option-bg px-5",
        open ? "gap-3 pb-5" : "h-[3.375rem]",
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
            <DraftField key={field.key} field={field} />
          ))}
          {fields.length === 0 ? (
            <p className="text-12 font-text text-ink-450">No fields in this section.</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
