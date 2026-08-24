/**
 * GENERATED FILE — DO NOT EDIT.
 *
 * Produced by scripts/gen-contract.mjs from src/agent-ui/ui-contract.json,
 * which is a verbatim snapshot of the backend's agui.ui_contract contract.
 *
 * Regenerate with: npm run contract:gen
 */

export const CONTRACT_VERSION = 1 as const;

/** Every component the agent may name. A name outside this list is a contract violation. */
export const COMPONENT_NAMES = [
  "crModeChoice",
  "featureComingSoon",
  "crIntakeForm",
  "templateOrCrPicker",
  "cycleIdPicker",
  "draftReview",
  "fieldPrompt",
  "submissionResult",
] as const;

export type ComponentName = (typeof COMPONENT_NAMES)[number];

// ── Shared shapes ───────────────────────────────────────────────────────────

export interface CrMode {
  value: "single" | "bulk";
  label: string;
  description?: string | null;
  /** Default: true. */
  enabled?: boolean;
}

export interface CardMeta {
  /** Display string, e.g. '11th Feb, 26  21:12 pm' */
  timestamp?: string | null;
  /** e.g. '30 sec' */
  processing_time?: string | null;
  tokens?: string | number | null;
  /** Pre-formatted, e.g. '$0.0023' */
  cost?: string | null;
}

export interface CrIntakeValues {
  platform?: string | null;
  target_system?: string | null;
  jira_id?: string | null;
  iris_id?: string | null;
  reason_for_change?: string | null;
  description_of_change?: string | null;
}

export interface DetailRow {
  label: string;
  value: string;
  tone?: "neutral" | "positive" | "negative" | null;
  /** Render full-width (long free text) Default: false. */
  wide?: boolean;
}

export interface OptionRow {
  label: string;
  value: string;
  /** Optional right-aligned pill, e.g. platform name */
  badge?: string | null;
  /** Default: false. */
  disabled?: boolean;
  details?: DetailRow[] | null;
}

export interface FieldRow {
  /** EDL key, e.g. zzfld00000v_cus */
  key: string;
  label: string;
  /** Display value, exactly as it will be submitted */
  value: string;
  /** Default: true. */
  editable?: boolean;
  /** system_readonly | compliance_locked | session_locked */
  lock_type?: string | null;
  field_type?: "text" | "boolean" | "dropdown" | null;
  /** For dropdown/boolean fields — the values SolMan will accept */
  allowed_values?: string[] | null;
  section?: string | null;
  /** Human-readable reason the field is locked */
  lock_reason?: string | null;
  /** True when no value will be submitted Default: false. */
  empty?: boolean;
}

export interface DraftSection {
  name: string;
  fields: FieldRow[];
}

// ── Component props ─────────────────────────────────────────────────────────

export interface CrModeChoiceProps {
  title: string;
  subtitle?: string | null;
  modes: CrMode[];
  meta?: CardMeta | null;
}

export interface FeatureComingSoonProps {
  title: string;
  message: string;
  /** Default: "Back". */
  back_label?: string | null;
  meta?: CardMeta | null;
}

export interface CrIntakeFormProps {
  title: string;
  subtitle?: string | null;
  /** Blue helper line under the first row */
  hint?: string | null;
  platforms: string[];
  target_systems?: string[] | null;
  /** Prefilled values, e.g. on re-entry after a validation error */
  values?: CrIntakeValues | null;
  /** Field-level server-side validation errors, keyed by field name */
  errors?: Record<string, string> | null;
  /** Default: false. */
  iris_enabled?: boolean;
  meta?: CardMeta | null;
}

export interface TemplateOrCrPickerProps {
  title: string;
  subtitle?: string | null;
  /** Default: "Template ID". */
  template_label?: string | null;
  /** Default: true. */
  template_optional?: boolean;
  template_options?: string[];
  /** Default: "Reference Change Request ID". */
  reference_label?: string | null;
  reference_options?: OptionRow[];
  selected_template?: string | null;
  selected_reference?: string | null;
  meta?: CardMeta | null;
}

export interface CycleIdPickerProps {
  message: string;
  options: OptionRow[];
  draft_cycle_id?: string | null;
  keep_current_label?: string | null;
  meta?: CardMeta | null;
}

export interface DraftReviewProps {
  title: string;
  subtitle?: string | null;
  sections: DraftSection[];
  /** e.g. 'These inputs will raise a change request for CR ID 45678987.' */
  confirm_text?: string | null;
  /** Default: "Are you sure to proceed?". */
  question_text?: string | null;
  notices?: string[] | null;
  actions?: OptionRow[];
  meta?: CardMeta | null;
}

export interface FieldPromptProps {
  title?: string | null;
  message: string;
  options?: OptionRow[];
  /** Default: true. */
  allow_free_text?: boolean;
  placeholder?: string | null;
  meta?: CardMeta | null;
}

export interface SubmissionResultProps {
  status: "success" | "failed";
  message: string;
  cr_id?: string | null;
  meta?: CardMeta | null;
}

// ── The discriminated union the host switches on ────────────────────────────

/**
 * A component the agent has selected. `name` is the discriminant, so narrowing
 * on it gives the card its exact props with no cast.
 */
export type AgentComponent =
  | { name: "crModeChoice"; props: CrModeChoiceProps }
  | { name: "featureComingSoon"; props: FeatureComingSoonProps }
  | { name: "crIntakeForm"; props: CrIntakeFormProps }
  | { name: "templateOrCrPicker"; props: TemplateOrCrPickerProps }
  | { name: "cycleIdPicker"; props: CycleIdPickerProps }
  | { name: "draftReview"; props: DraftReviewProps }
  | { name: "fieldPrompt"; props: FieldPromptProps }
  | { name: "submissionResult"; props: SubmissionResultProps };

/** Maps a component name to its props type, for the registry's signature. */
export interface PropsByName {
  crModeChoice: CrModeChoiceProps;
  featureComingSoon: FeatureComingSoonProps;
  crIntakeForm: CrIntakeFormProps;
  templateOrCrPicker: TemplateOrCrPickerProps;
  cycleIdPicker: CycleIdPickerProps;
  draftReview: DraftReviewProps;
  fieldPrompt: FieldPromptProps;
  submissionResult: SubmissionResultProps;
}
