import type { DraftReviewProps, FieldRow } from "@/agent-ui/contract.generated";
import { FIXTURES } from "@/agent-ui/fixtures.generated";

/**
 * A realistic `draftReview` payload, for development only.
 *
 * ── Why this exists, and why it is NOT a fixture ────────────────────────────
 * `fixtures.generated.ts` is the backend's own example, generated from
 * `ui-contract.json`. It carries a single section with one field, which is
 * enough to prove the card renders and useless for judging the layout: the
 * two-column grid, the expand-to-full-width behaviour and the long-value
 * collapse only show their worth against a full payload.
 *
 * So this file sits under `src/app/dev/`, is imported only by the gallery, and
 * ships in no production build. It must never be used by a test — a test that
 * asserts against invented data is asserting what someone assumed the backend
 * sends. The tests keep using the generated fixtures.
 *
 * Section names and field mix follow the screens the client reviewed.
 */
const field = (
  key: string,
  label: string,
  value: string,
  extra: Partial<FieldRow> = {},
): FieldRow => ({
  key,
  label,
  value,
  section: extra.section ?? "",
  field_type: extra.field_type ?? "text",
  editable: extra.editable ?? true,
  empty: extra.empty ?? false,
  allowed_values: extra.allowed_values ?? null,
  lock_reason: extra.lock_reason ?? null,
  lock_type: extra.lock_type ?? null,
});

const LONG_REASON =
  "The FY27 treasury posting rules change the way intercompany settlements are " +
  "cleared, and the current configuration posts them to the interim account " +
  "rather than the settlement account. Finance raised this after the July close " +
  "took four extra days to reconcile, and the same variance is expected every " +
  "month until the posting rules are corrected.";

const LONG_DESCRIPTION =
  "Update the posting rules for intercompany settlements so that cleared items " +
  "post directly to the settlement account, and adjust the nightly " +
  "reconciliation job to match. Includes a change to the variance tolerance, " +
  "which currently rejects differences under one unit and leaves them for manual " +
  "clearing.";

export const RICH_DRAFT_REVIEW: DraftReviewProps = {
  ...FIXTURES.draftReview,
  title: "Please review the Change Request Draft and update the information if required.",
  subtitle: "By clicking on proceed, your change request will be raised successfully.",
  sections: [
    {
      name: "Change Request",
      fields: [
        field("description_of_change", "Description Of Change", LONG_DESCRIPTION),
        field("reason_for_change", "Reason For Change", LONG_REASON),
        field("priority", "Priority", "Medium", { allowed_values: ["Low", "Medium", "High"] }),
        field("cr_type", "Change Request Type", "Normal", {
          editable: false,
          lock_type: "compliance",
          lock_reason: "Set by the change policy for this platform.",
        }),
      ],
    },
    {
      name: "Details",
      fields: [
        field("transaction_type", "Transaction Type", "ZHHF", { editable: false }),
        field("requested_by", "Requested By", "Kelvin Johnson", { editable: false }),
        field("additional_information", "Additional Information", "", { empty: true }),
        field("planned_date", "Planned Date", "12 Mar 2026"),
      ],
    },
    {
      name: "Request For Change Scope",
      fields: [
        field("scope", "Scope", "Configuration only"),
        field("downtime", "Downtime Required", "No", { allowed_values: ["Yes", "No"] }),
        field("systems_affected", "Systems Affected", "PJS 0021237113, PJS 0021237114"),
      ],
    },
    {
      name: "Approval",
      fields: [
        field("approver", "Approver", "E. Hossri", { editable: false }),
        field("approval_route", "Approval Route", "Standard", {
          allowed_values: ["Standard", "Expedited"],
        }),
      ],
    },
    {
      name: "Functional Areas",
      fields: [
        field("functional_area", "Functional Area", "Finance"),
        field("sub_area", "Sub Area", "Treasury"),
        field("process", "Business Process", "Intercompany settlement"),
      ],
    },
    {
      name: "Location",
      fields: [
        field("site", "Site", "Zug"),
        field("region", "Region", "EMEA", { editable: false }),
      ],
    },
    {
      name: "Documentation",
      fields: [
        field("spec_document", "Specification Document", "SPEC-4471"),
        field("test_evidence", "Test Evidence", "", { empty: true }),
      ],
    },
    {
      name: "Validation Requirements",
      fields: [
        field("gxp_relevant", "GxP Relevant", "No", { allowed_values: ["Yes", "No"] }),
        field("sox_impact", "SOX Impact", "Yes", { allowed_values: ["Yes", "No"] }),
        field("security_change", "Security Change", "No", { allowed_values: ["Yes", "No"] }),
        field("ricef", "RICEF", "", { empty: true }),
        field("sod_ruleset", "SoD Ruleset", "Standard"),
      ],
    },
  ],
};
