"use client";

import { useEffect, useRef } from "react";
import { AgentComponentHost } from "@/agent-ui/AgentComponentHost";
import { resolveEnvelope } from "@/agent-ui/resolveEnvelope";
import type { Turn } from "@/agent-ui/transcript";
import type { Respond } from "@/agent-ui/types";
import { UserTurn } from "@/ui/UserTurn";

/**
 * shell/Transcript.tsx
 *
 * Lives in the shell, not in `ui/`, because it composes the contract layer and
 * the registry — and `ui/` is a leaf that may import neither. The rule caught
 * this on the first attempt to put it there.
 *
 * The conversation: every turn the agent asked, each followed by what the user
 * answered, oldest first.
 *
 * ── Why past turns go back through `resolveEnvelope` ────────────────────────
 * A stored envelope is not trusted input. It was written by an earlier build of
 * this app into storage the user can edit, and the contract may have moved since
 * it was written. Re-validating means a transcript entry that no longer matches
 * the contract renders a stated failure instead of being cast into a card's
 * props and crashing it.
 *
 * ── Why every past turn is `settled` ────────────────────────────────────────
 * Only the last turn can be answered. An earlier card must render inert even
 * though its envelope originally arrived as an interrupt — otherwise the
 * transcript is a page full of live approve buttons.
 */
export interface TranscriptProps {
  turns: readonly Turn[];
  respond: Respond;
  /** Display name for the user's bubbles. */
  userName: string;
  /** True while the agent is working, so the caller can show progress. */
  busy?: boolean;
}

export function Transcript({ turns, respond, userName, busy = false }: TranscriptProps) {
  const endRef = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  /** The newest turn, so a new question can be brought to the top of the view. */
  const latestRef = useRef<HTMLDivElement>(null);
  /**
   * Whether to follow new turns. Set false as soon as the user scrolls up:
   * yanking someone back to the bottom while they are re-reading an earlier
   * card is the single most irritating thing a chat transcript can do.
   */
  const follow = useRef(true);

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const onScroll = () => {
      const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
      follow.current = distanceFromBottom < 80;
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  /*
   * Where to scroll depends on what just arrived.
   *
   * A new QUESTION is brought to the top of the view. Scrolling to the bottom
   * instead — which is what a chat normally does — lands the user at the END of
   * a card that can be taller than the viewport, so a draft review opens on its
   * action buttons with the fields and the title already scrolled past. The
   * thing they need to read first is off screen, and nothing signals that.
   *
   * A user's own REPLY scrolls to the bottom, because it is short and what
   * matters is seeing that it was sent.
   */
  const lastTurn = turns[turns.length - 1];
  const awaitingAnswer = lastTurn != null && lastTurn.answer == null;

  useEffect(() => {
    if (!follow.current) return;

    if (awaitingAnswer) {
      latestRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    } else {
      endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [turns, awaitingAnswer]);

  return (
    <div ref={scroller} className="h-full overflow-y-auto">
      {/*
       * `role="log"` with a polite live region: a new card is announced to a
       * screen reader without interrupting what is being read. `assertive`
       * would talk over the user mid-sentence.
       */}
      {/*
        No outer padding: `AppShell` already pads the slot this sits in, and the
        two together were adding 56px above the first card and 48px down each
        side — a visibly narrower conversation for no reason. Vertical breathing
        room only, so the last card clears the composer.
      */}
      <div role="log" aria-live="polite" aria-busy={busy} className="flex flex-col gap-8 pb-4">
        {turns.map((turn, i) => {
          const isLast = i === turns.length - 1;
          const resolution = resolveEnvelope({ interruptValue: turn.envelope });

          return (
            <div
              key={turn.id}
              ref={isLast ? latestRef : undefined}
              // Clears the chat header band when this turn is scrolled to the
              // top, so the card starts below it rather than flush against it.
              className="flex scroll-mt-6 flex-col gap-6"
            >
              <AgentComponentHost
                resolution={resolution}
                respond={respond}
                answer={turn.answer}
                settled={!isLast || turn.answer != null}
              />
              {turn.answer && (
                <UserTurn label={turn.answer.label} at={turn.answer.at} name={userName} />
              )}
            </div>
          );
        })}
        <div ref={endRef} />
      </div>
    </div>
  );
}
