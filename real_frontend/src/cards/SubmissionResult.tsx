/**
 * cards/SubmissionResult.tsx — Figma 59575:11901.
 * Contract component `submissionResult`. The terminal card.
 *
 * Structurally the simplest card in the set: one message line and the meta strip.
 * The design carries no icon and no status colour — the agent's sentence does the
 * work, and it already contains the CR ID ("Your Change Request for CR 87656789
 * has been successfully submitted as draft.").
 *
 * ── The rule that is not cosmetic ───────────────────────────────────────────
 * `solman_write` can return `success: true` with `cr_id: null`. Telling someone
 * their change request was created, with no identifier to reconcile against, is
 * worse than telling them to go and check — they would have nothing to search
 * for and no reason to look.
 *
 * So a success with no CR ID is rendered as a **failure**. That is a deliberate
 * disagreement with the agent's own `status`, and the only one in the whole
 * card set.
 *
 * The failed treatment itself is inferred — the design set only shows success.
 * See G24.
 */
import type { AgentCardProps } from "@/agent-ui/types";
import { CardShell } from "./CardShell";
import { cn } from "@/lib/cn";

export function SubmissionResult({ props }: AgentCardProps<"submissionResult">) {
  const missingId = props.status === "success" && !props.cr_id;
  const failed = props.status === "failed" || missingId;

  return (
    <CardShell meta={props.meta}>
      <div className="flex w-full flex-col items-start gap-2">
        <p
          className={cn(
            "w-full text-16 font-text font-medium leading-normal",
            failed ? "text-error" : "text-ink-900",
          )}
        >
          {props.message}
        </p>

        {missingId ? (
          <p className="text-12 font-text text-ink-500">
            The agent reported success but returned no change request ID. Check the request in
            SolMan before submitting it again.
          </p>
        ) : null}
      </div>
    </CardShell>
  );
}
