/**
 * cards/regenerateField.ts
 *
 * Asks the agent for a fresh value for a generated field.
 *
 * ── THIS IS A STUB ──────────────────────────────────────────────────────────
 * The backend has no regenerate action yet. `draftReview.actions` carries only
 * approve/reject-style values, and unlike a field *edit* — which `node_9` accepts
 * as `"Field Name: value"` — there is no reply shape that means "produce this
 * again".
 *
 * So this returns a plausible rewrite locally, after a short delay, purely so the
 * idle → retrying → comparing states can be built and demonstrated.
 *
 * **The whole of the real implementation is the body of `regenerateField`.**
 * Nothing else needs to change: the card awaits a promise of a string and does
 * not care where it came from. When the backend lands, replace the body with the
 * call and delete `draftAlternative`.
 *
 * See DECISIONS.md D36 and G29.
 */
import type { FieldRow } from "@/agent-ui/contract.generated";

/**
 * Fields the agent authored and can therefore regenerate.
 *
 * Matched by contract key because the contract has no flag for it — nothing in
 * `FieldRow` distinguishes a value the agent wrote from one SolMan supplied.
 * Both of these come from `generate_cr_fields_from_jira`.
 *
 * A `regenerable: true` prop would remove this list entirely; raised as G30.
 */
const REGENERABLE_KEYS = new Set(["description_of_change", "reason_for_change"]);

export function isRegenerable(field: FieldRow): boolean {
  if (field.editable === false || field.lock_type != null) return false;
  return REGENERABLE_KEYS.has(field.key);
}

/** Remove when the real call lands. */
function draftAlternative(field: FieldRow): string {
  const current = (field.value ?? "").trim();
  if (!current) return "";
  // A visibly different phrasing, so the compare view has something to compare.
  const first = current.charAt(0).toLowerCase() + current.slice(1);
  return `Revised: ${first}${current.endsWith(".") ? "" : "."} Regenerated from the linked Jira ticket.`;
}

export async function regenerateField(field: FieldRow, signal?: AbortSignal): Promise<string> {
  // ── replace everything below with the real call ───────────────────────────
  if (process.env.NODE_ENV !== "production") {
    console.info(
      `[regenerateField] STUB — returning a locally generated alternative for "${field.label}". ` +
        `No backend call was made.`,
    );
  }

  await new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, 900);
    signal?.addEventListener("abort", () => {
      clearTimeout(t);
      reject(new DOMException("aborted", "AbortError"));
    });
  });

  return draftAlternative(field);
}
