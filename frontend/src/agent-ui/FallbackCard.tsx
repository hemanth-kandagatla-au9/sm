/**
 * agent-ui/FallbackCard.tsx
 *
 * What the user sees when the agent sends something this app cannot render.
 *
 * This is not decoration. `solman_write` can report success with a null CR ID,
 * and the graph can be mid-approval when a contract mismatch lands. On a
 * regulated change-request path, a blank panel reads as "nothing happened" when
 * the truth may be "something happened and you cannot see what". So the failure
 * is stated plainly, and it tells the user what to do next.
 *
 * There is no Figma frame for this state — it is an engineering safety net, not
 * a designed screen. It is built from tokens so it cannot drift off-brand.
 */
import type { Resolution } from "./types";
import { explain } from "./resolveEnvelope";

export function FallbackCard({ resolution }: { resolution: Resolution }) {
  if (resolution.status === "ok") return null;

  return (
    <section
      role="alert"
      className="w-full max-w-[42.5rem] rounded-xl border border-line bg-surface p-6 shadow-card"
      data-agent-fallback={resolution.status}
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-chip bg-brand text-12 font-text font-bold text-white"
        >
          !
        </span>
        <div className="min-w-0">
          <h2 className="text-16 font-text font-medium text-ink-900">
            This step could not be displayed
          </h2>
          <p className="mt-2 text-16 font-text text-ink-500">{explain(resolution)}</p>
          <p className="mt-3 text-12 font-text text-ink-400">
            Your change request has not been lost. Check its status in SolMan before retrying.
          </p>
        </div>
      </div>
    </section>
  );
}
