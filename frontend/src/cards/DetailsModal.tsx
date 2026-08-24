/**
 * cards/DetailsModal.tsx — Figma "CR Details" (59602:12443).
 *
 * The expansion panel for a selectable option. The integration doc describes
 * these as rows that "expand"; the design makes it a **centred modal over a
 * scrim**, not an inline disclosure. Built as designed.
 *
 * Every row comes from the agent's `details` array. The frontend never fetches
 * or derives them, and never re-orders them — `tone` in particular is set by the
 * agent (`positive` on Platform means *the agent matched it against the user's
 * platform*), so inferring it client-side would invent a claim the agent did not
 * make.
 *
 * Layout: 787×398, radius 24, padding 20, gap 20. A header row with the option
 * label and a close button, then a two-column table — label column filled
 * `table-head`, value column plain, 1px `table-line` throughout.
 */
"use client";

import { useEffect, useRef } from "react";
import type { DetailRow } from "@/agent-ui/contract.generated";
import { cn } from "@/lib/cn";

export function DetailsModal({
  title,
  details,
  onClose,
}: {
  title: string;
  details: DetailRow[];
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* The scrim is a real button so a click anywhere outside dismisses. */}
      <button
        type="button"
        aria-label="Close details"
        onClick={onClose}
        className="absolute inset-0 bg-scrim"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative flex w-[49.1875rem] max-w-[calc(100vw-2rem)] flex-col gap-5 rounded-2xl bg-surface p-5"
      >
        <div className="flex items-center justify-between gap-[4.8125rem] border-b border-line py-2.5">
          <h2 className="text-20 font-display font-medium text-ink-900">{title}</h2>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid size-[1.875rem] shrink-0 place-items-center rounded-full bg-modal-close"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
              <path d="M4.5 4.5L13.5 13.5M13.5 4.5L4.5 13.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/*
         * A CSS grid rather than a <table>: the design's two columns are a
         * label/value list, and grid keeps the two columns aligned while letting
         * a `wide` row span both. Row semantics are carried by role attributes.
         */}
        <div
          role="table"
          className="grid max-h-[60vh] grid-cols-2 overflow-y-auto rounded-lg border border-table-line"
        >
          {details.map((row, i) => (
            <div role="row" key={`${row.label}-${i}`} className="contents">
              <div
                role="rowheader"
                className={cn(
                  "flex min-h-[2.75rem] items-center gap-3 border border-table-line bg-table-head px-6 py-3",
                  i === 0 && "rounded-tl-lg",
                )}
              >
                <span className="text-14 font-text font-medium text-ink-900">{row.label}</span>
              </div>
              <div
                role="cell"
                className={cn(
                  "flex min-h-[2.75rem] items-center gap-3 border border-table-line px-6 py-3",
                  i === 0 && "rounded-tr-lg",
                )}
              >
                <span
                  className={cn(
                    "text-14 font-text",
                    // `tone` is the agent's signal, not a computed one.
                    row.tone === "positive"
                      ? "text-success"
                      : row.tone === "negative"
                        ? "text-error"
                        : "text-ink-600",
                  )}
                >
                  {row.value}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
