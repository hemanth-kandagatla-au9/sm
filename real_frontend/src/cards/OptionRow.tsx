/**
 * cards/OptionRow.tsx — Figma 59602:12552.
 *
 * A selectable option: radio, label, optional platform badge, optional
 * disclosure chevron. Used by `templateOrCrPicker` and `cycleIdPicker`, both of
 * which take the contract's shared `OptionRow` shape.
 *
 * ── The rule this component exists to enforce ───────────────────────────────
 * **Expanding and selecting are separate actions.** The chevron opens the
 * details; the row body selects. Picking a baseline CR determines every field of
 * the resulting draft, so it must not be possible to select one as a side effect
 * of trying to read it. The chevron therefore stops propagation, and it is a
 * sibling button rather than a nested one — a button inside a button is invalid
 * HTML and browsers resolve the click unpredictably.
 *
 * A row whose `details` are absent or empty renders **no disclosure control at
 * all**, rather than a chevron that opens an empty panel.
 */
"use client";

import type { OptionRow as OptionShape } from "@/agent-ui/contract.generated";
import { Radio } from "./Radio";
import { Icon } from "@/ui/Icon";
import { Tip } from "@/ui/Tooltip";
import { cn } from "@/lib/cn";

export function OptionRow({
  option,
  selected,
  disabled,
  onSelect,
  onExpand,
}: {
  option: OptionShape;
  selected: boolean;
  disabled?: boolean;
  onSelect: () => void;
  onExpand: () => void;
}) {
  const expandable = (option.details?.length ?? 0) > 0;
  const inert = disabled || option.disabled;

  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-lg border border-line-soft bg-option-bg p-2",
        inert && "opacity-60",
      )}
    >
      {/*
        Two options per row, so a long CR label truncates. The tooltip goes on
        the control, not on the truncated span: Radix makes its trigger
        focusable, and a focusable span inside a button is invalid nesting that
        traps a keyboard user between two stops for one thing.
      */}
      <Tip label={option.label} side="top">
        <button
          type="button"
          role="radio"
          aria-checked={selected}
          disabled={inert}
          onClick={onSelect}
          className="group/option flex min-w-0 flex-1 items-center gap-2 text-left disabled:cursor-not-allowed"
        >
          <span className="flex min-w-0 flex-1 items-center gap-1.5">
            <Radio checked={selected} disabled={inert} />
            <span className="truncate text-16 font-display font-medium leading-[1.2] text-ink-900">
              {option.label}
            </span>
          </span>
          {option.badge ? <Badge>{option.badge}</Badge> : null}
        </button>
      </Tip>

      {expandable ? (
        <button
          type="button"
          onClick={onExpand}
          aria-label={`View details for ${option.label}`}
          className="grid size-4 shrink-0 place-items-center"
        >
          <Icon src="chevron-down-field.svg" width={16} height={16} />
        </button>
      ) : null}
    </div>
  );
}

/** The platform flag — Figma "Flags" (58012:36006). */
export function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="flex shrink-0 items-center gap-1.5 rounded-full border-[0.5px] border-badge-blue-line bg-surface px-3 py-[0.2136rem] text-12 font-text font-medium text-badge-blue whitespace-nowrap">
      {children}
    </span>
  );
}
