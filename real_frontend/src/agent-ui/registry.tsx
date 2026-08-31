/**
 * agent-ui/registry.tsx
 *
 * The set of components the agent is allowed to name. Anything outside this map
 * cannot be rendered — that is the whole controlled-UI model, and it is what
 * makes the agent unable to ship UI of its own.
 *
 * Adding a component means three edits that must agree:
 *   1. the builder + schema in the backend's agui/ui_contract.py
 *   2. `npm run contract:pull && npm run contract:gen` here
 *   3. an entry below
 * The compiler catches 2↔3. `assertRegistryMatchesContract` catches 1↔3 in dev.
 *
 * ── This map is now TOTAL ───────────────────────────────────────────────────
 * All eight contract components are implemented, so the type moved from
 * `Registry` (every key optional) to `TotalRegistry` (every key required).
 *
 * From this line onwards, a component added to the contract without a card here
 * is a **compile error** rather than a runtime fallback. That was the plan from
 * Step 3: start partial so the build can go green while cards are built, and
 * tighten the moment the last one lands.
 *
 * `FallbackCard` does not become dead code — it still covers the failures the
 * compiler cannot see: a malformed envelope, an unsupported contract version, a
 * name from a backend newer than this build.
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
