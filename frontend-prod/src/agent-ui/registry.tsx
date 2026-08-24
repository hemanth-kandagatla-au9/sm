/**
 * agent-ui/registry.tsx
 *
 * The set of components the agent is allowed to name. Anything outside this map
 * cannot be rendered — that is the whole point of the controlled-UI model, and
 * it is what makes the agent unable to ship UI of its own.
 *
 * Adding a component means three edits that must agree:
 *   1. the builder + schema in the backend's agui/ui_contract.py
 *   2. `npm run contract:pull && npm run contract:gen` here
 *   3. an entry below
 * The compiler catches 2↔3. `assertRegistryMatchesContract` catches 1↔3 in dev.
 *
 * **This map is now total** (`TotalRegistry`, not `Registry`) — all eight
 * contract components are implemented, so a component added to the contract
 * without a card here is a compile error rather than a runtime placeholder.
 * That was the plan in DECISIONS.md D9, and `PlaceholderCard` goes with it.
 */
import { CrIntakeForm } from "@/cards/CrIntakeForm";
import { CrModeChoice } from "@/cards/CrModeChoice";
import { CycleIdPicker } from "@/cards/CycleIdPicker";
import { DraftReview } from "@/cards/DraftReview";
import { FeatureComingSoon } from "@/cards/FeatureComingSoon";
import { FieldPrompt } from "@/cards/FieldPrompt";
import { SubmissionResult } from "@/cards/SubmissionResult";
import { TemplateOrCrPicker } from "@/cards/TemplateOrCrPicker";
import type { TotalRegistry } from "./types";

export const REGISTRY: TotalRegistry = {
  crModeChoice: CrModeChoice,
  featureComingSoon: FeatureComingSoon,
  crIntakeForm: CrIntakeForm,
  templateOrCrPicker: TemplateOrCrPicker,
  cycleIdPicker: CycleIdPicker,
  draftReview: DraftReview,
  fieldPrompt: FieldPrompt,
  submissionResult: SubmissionResult,
};
