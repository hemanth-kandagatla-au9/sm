/**
 * cards/CardShell.tsx — Figma 59646:14741.
 *
 * The chrome every agent card sits in: the chatbot avatar, the speech-bubble
 * card, and the meta strip along the bottom. Extracted before the first card
 * because all eight share it, and because the meta strip is contract data
 * (`CardMeta`) rather than anything a card computes for itself.
 *
 * Two details from the design that are easy to lose:
 *
 *   - The card's **bottom-left corner is square**; the other three are 16px.
 *     It is a speech bubble pointing at the avatar beside it.
 *   - The avatar is **bottom-aligned** with the card (`items-end`), not top.
 *
 * Cards pass their own content as children. They do not render their own
 * avatar, border, padding, or footer.
 */
import type { CardMeta } from "@/agent-ui/contract.generated";
import { Icon } from "@/ui/Icon";

function AgentAvatar() {
  return (
    <div
      aria-hidden
      className="relative size-8 shrink-0 overflow-clip rounded-full border border-brand-a12 bg-linear-to-b from-avatar-from to-avatar-to shadow-avatar"
    >
      {/* The glyph sits at 20% inset of the 32px circle — 19.2px. */}
      <span className="absolute inset-[20%] grid place-items-center">
        <Icon src="agent-avatar.svg" width={19.2} height={19.2} />
      </span>
      <span
        aria-hidden
        className="pointer-events-none absolute -inset-px rounded-[inherit] shadow-avatar-inset"
      />
    </div>
  );
}

/** A bordered pill in the meta strip, e.g. "token 23" or "Cost $00023". */
function MetaPill({ label, value }: { label: string; value: string }) {
  return (
    <span className="flex h-[1.375rem] items-center gap-1 rounded-full border border-ink-500 px-2 py-0.5">
      <span className="text-10 font-text capitalize text-ink-500">{label}</span>
      <span className="text-10 font-text font-medium text-ink-900">{value}</span>
    </span>
  );
}

function MetaStrip({ meta }: { meta: CardMeta }) {
  const hasCost = meta.processing_time || meta.tokens != null || meta.cost;

  return (
    <div className="flex w-full flex-col gap-1.5">
      <div className="h-px w-full bg-line" />
      {/*
       * gap-4 matters on a narrow card. `justify-between` alone leaves the two
       * groups touching once the row runs out of slack, so the timestamp and
       * "Processing Time" read as one string.
       */}
      <div className="flex w-full flex-wrap items-center justify-between gap-x-4 gap-y-1 whitespace-nowrap">
        {/*
         * The design colours the date and the time differently (#677489 and
         * #adb4c1). The contract sends `timestamp` as a single pre-formatted
         * display string, so we cannot split them without parsing agent text —
         * which is exactly the coupling the contract exists to prevent. Rendered
         * as one string; raised with the backend team. See DECISIONS.md G12.
         */}
        <span className="text-10 font-text text-ink-500">{meta.timestamp}</span>

        {hasCost ? (
          <span className="flex items-center gap-3">
            {meta.processing_time ? (
              <span className="text-10 font-text">
                <span className="text-ink-500">Processing Time:</span>{" "}
                <span className="font-medium text-ink-900">{meta.processing_time}</span>
              </span>
            ) : null}
            <span className="flex items-center gap-2">
              {meta.tokens != null ? <MetaPill label="token" value={String(meta.tokens)} /> : null}
              {meta.cost ? <MetaPill label="Cost" value={meta.cost} /> : null}
            </span>
          </span>
        ) : null}
      </div>
    </div>
  );
}

export function CardShell({
  meta,
  children,
}: {
  /** Supplied by the agent. Null on cards where it has nothing to report. */
  meta?: CardMeta | null;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-end gap-3">
      <AgentAvatar />
      <div className="flex flex-col items-start gap-5 overflow-clip rounded-t-xl rounded-br-xl border border-line bg-surface p-6">
        {children}
        {meta ? <MetaStrip meta={meta} /> : null}
      </div>
    </div>
  );
}
