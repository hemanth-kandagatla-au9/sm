/**
 * ui/UserTurn.tsx
 *
 * The user's reply in the transcript — the right-hand bubble.
 *
 * It is a mirror of `CardShell`: where an agent card is left-aligned with the
 * avatar on its left and a square bottom-LEFT corner, this is right-aligned with
 * the avatar on its right and a square bottom-RIGHT corner. Both are speech
 * bubbles pointing at whoever said the thing.
 *
 * It shows the **label**, never the value. The graph routes on tokens like
 * `approve`; echoing that back would be showing the user routing internals
 * rather than what they did.
 */
import { Icon } from "./Icon";

export interface UserTurnProps {
  /** Human text for what the user chose. Never the routing token. */
  label: string;
  /** Epoch milliseconds. */
  at: number;
  /** Display name of the person. Placeholder until authentication lands. */
  name: string;
}

/**
 * "11th Feb, 26  21:12 pm" — the design's format, including its lower-case
 * meridiem and the ordinal suffix on the day.
 */
function formatStamp(at: number): string {
  const d = new Date(at);
  const day = d.getDate();
  const suffix =
    day % 10 === 1 && day !== 11
      ? "st"
      : day % 10 === 2 && day !== 12
        ? "nd"
        : day % 10 === 3 && day !== 13
          ? "rd"
          : "th";
  const month = d.toLocaleString("en-GB", { month: "short" });
  const year = String(d.getFullYear()).slice(-2);
  const hours = d.getHours();
  const mins = String(d.getMinutes()).padStart(2, "0");
  const meridiem = hours < 12 ? "am" : "pm";
  const twelve = hours % 12 === 0 ? 12 : hours % 12;
  return `${day}${suffix} ${month}, ${year}  ${twelve}:${mins} ${meridiem}`;
}

export function UserTurn({ label, at, name }: UserTurnProps) {
  return (
    <div className="flex items-end justify-end gap-3">
      <div className="flex max-w-[26rem] flex-col items-end gap-1 rounded-t-xl rounded-bl-xl border border-line bg-surface px-5 py-4 shadow-card">
        <p className="text-16 font-text font-medium text-ink-900">{label}</p>
        <p className="flex items-center gap-2 text-10 font-text text-ink-500">
          {/* `dateTime` gives assistive tech and any future parser the real
              instant, while the visible text stays in the design's format. */}
          <time dateTime={new Date(at).toISOString()}>{formatStamp(at)}</time>
          <span aria-hidden className="text-ink-250">
            |
          </span>
          <span>{name}</span>
        </p>
      </div>
      <Icon src="avatar.png" width={32} height={32} className="rounded-full" />
    </div>
  );
}
