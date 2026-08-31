/**
 * cards/DraftReview.tsx — Figma 59571:11519. Contract component `draftReview`.
 * Screen 4 — the approval checkpoint, and the most consequential card in the flow.
 *
 * Sections render as a two-column grid of accordion tiles. Opening one shows its
 * fields; `DraftSection` handles the two field treatments and the lock reasons.
 *
 * ── Actions send literal tokens ─────────────────────────────────────────────
 * The buttons send `option.value` verbatim — `approve`, `reject` — never their
 * label. `cond_edge_b`'s approval guard is a **substring test**, which free text
 * trips: a response of "Submit for Approval" contains no "approve", while a
 * response of "I do not approve" contains one. Sending the token is the only
 * safe option, and it is why the card never derives a value from a label.
 *
 * ── Editing is a turn, not a save ───────────────────────────────────────────
 * `actions` carries only approve/reject-style values, so there is no *action*
 * for a field change. There is still a channel: `node_9_hitl_wait` runs every
 * reply through `_looks_like_field_update_message` and routes anything shaped
 * `"Field Name: value"` to `cond_edge_b` for update parsing instead of approval
 * routing.
 *
 * So the pencil on an editable field sends that string as **this turn's answer**.
 * The agent revalidates against the same `DROPDOWN_FIELDS` / `get_field_metadata`
 * the card was rendered from, and presents the draft again.
 *
 * ── Retry ───────────────────────────────────────────────────────────────────
 * Fields the agent authored also carry a retry control: it asks for the value to
 * be written *again*, and shows the result beside the original so the user
 * chooses. A regenerated description that silently replaced the original would
 * be a change nobody agreed to, which is why it is a candidate until picked.
 *
 * Currently stubbed — `regenerateField.ts` has the single swap point.
 *
 * Only one field can be busy at a time, because one turn has one answer.
 *
 * See DECISIONS.md D35 (edit) and D36 (retry). Together they supersede G23.
 */
"use client";

import { useRef, useState } from "react";
import type { AgentCardProps } from "@/agent-ui/types";
import type { FieldRow } from "@/agent-ui/contract.generated";
import { CardShell } from "./CardShell";
import { DraftSection, type FieldActivity } from "./DraftSection";
import { regenerateField } from "./regenerateField";
import { cn } from "@/lib/cn";

/**
 * Button treatments, in the order the design places them (59616:13505–13508).
 * The last action is the primary; a destructive-sounding one is the soft-danger
 * secondary; anything else is the plain secondary.
 */
function actionClass(index: number, total: number, value: string) {
  const isPrimary = index === total - 1;
  const isDanger = /reject|cancel|discard/i.test(value);
  if (isPrimary) return "bg-btn-primary text-surface";
  if (isDanger) return "border border-line bg-surface text-ink-600";
  return "border border-danger-soft-line bg-danger-soft-bg text-danger-soft-text";
}

export function DraftReview({
  props,
  respond,
  pending,
}: AgentCardProps<"draftReview">) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [answered, setAnswered] = useState(false);
  /**
   * At most one field across the card may be busy — editing or retrying. There
   * is one response channel and one answer per turn; two pending changes could
   * not both be sent, and offering them would imply otherwise.
   */
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [activity, setActivity] = useState<FieldActivity | null>(null);
  const retryAbort = useRef<AbortController | null>(null);
  const disabled = !pending || answered;

  function clearActivity() {
    retryAbort.current?.abort();
    retryAbort.current = null;
    setActiveKey(null);
    setActivity(null);
  }

  /**
   * Ask the agent to write the value again. The result is a *candidate* — it is
   * not applied until the user picks it, because a regenerated description that
   * silently replaced the original would be a change nobody agreed to.
   */
  async function startRetry(field: FieldRow) {
    if (disabled) return;
    retryAbort.current?.abort();
    const ctrl = new AbortController();
    retryAbort.current = ctrl;

    setActiveKey(field.key);
    setActivity({ kind: "retry-loading" });

    try {
      const candidate = await regenerateField(field, ctrl.signal);
      if (ctrl.signal.aborted) return;
      setActivity({ kind: "retry-compare", candidate });
    } catch (err) {
      if ((err as Error)?.name === "AbortError") return;
      // A failed regeneration must not strand the field mid-state.
      clearActivity();
    }
  }

  function toggle(name: string) {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  function act(value: string, label: string) {
    if (disabled) return;
    setAnswered(true);
    // The token routes; the label is what the transcript shows. They differ on
    // purpose — see the approval-guard note above.
    respond(value, label);
  }

  /**
   * A changed value IS this turn's answer, not a local save — whether the user
   * typed it or accepted a regenerated one.
   *
   * `node_9_hitl_wait` runs every reply through `_looks_like_field_update_message`
   * and routes anything shaped `"Field Name: value"` to update parsing rather
   * than approval routing. So the payload is that exact shape — the field's
   * display label, a colon, the new value.
   *
   * Newlines are collapsed because the helper splits on the first colon and
   * treats the remainder as the value; a multi-line value still parses, but a
   * single line is what the graph's own examples look like.
   */
  function submitValue(field: FieldRow, value: string) {
    if (disabled || !value.trim()) return;
    setAnswered(true);
    clearActivity();
    const message = `${field.label}: ${value.replace(/\s*\n\s*/g, " ").trim()}`;
    // An edit is already human-readable, so it is its own transcript label.
    respond(message, message);
  }

  const actions = props.actions ?? [];

  return (
    <CardShell meta={props.meta}>
      <div className="flex w-full flex-col items-start gap-4">
        <div className="flex w-full flex-col justify-center gap-2">
          <p className="text-16 font-text font-medium leading-normal text-ink-900">
            {props.title}
          </p>
          {props.subtitle ? (
            <p className="text-16 font-text leading-normal text-ink-400">
              {props.subtitle}
            </p>
          ) : null}
        </div>

        {/*
         * Two columns of collapsed tiles; an OPEN section spans both.
         *
         * Before this, an expanded section kept its half-width column and its
         * fields stacked in a single narrow line down one side, while the other
         * column sat empty beside it — the card grew tall and half of it was
         * whitespace. Spanning the row uses the space that was already there.
         *
         * Grid order does the rest: the open section occupies a full row where
         * it already sat, and the tiles after it reflow underneath until it is
         * collapsed again. No reordering, so a section does not move under the
         * pointer when it is opened.
         */}
        <div className="grid w-full grid-cols-1 gap-3 md:grid-cols-2">
          {props.sections.map((section) => (
            <div
              key={section.name}
              className={cn(open.has(section.name) && "md:col-span-2")}
            >
              <DraftSection
                name={section.name}
                fields={section.fields}
                open={open.has(section.name)}
                onToggle={() => toggle(section.name)}
                activeKey={activeKey}
                activity={activity}
                disabled={disabled}
                onStartEdit={(key) => {
                  // Starting an activity implies the section is open.
                  setOpen((prev) => new Set(prev).add(section.name));
                  setActiveKey(key);
                  setActivity({ kind: "edit" });
                }}
                onStartRetry={(field) => {
                  setOpen((prev) => new Set(prev).add(section.name));
                  void startRetry(field);
                }}
                onCancel={clearActivity}
                onSubmitValue={submitValue}
              />
            </div>
          ))}
        </div>

        {props.notices?.length ? (
          <ul className="flex w-full flex-col gap-1">
            {props.notices.map((notice, i) => (
              <li key={i} className="text-12 font-text text-warning">
                {notice}
              </li>
            ))}
          </ul>
        ) : null}

        <div className="flex w-full flex-col items-start justify-center gap-4">
          {props.confirm_text || props.question_text ? (
            <p className="w-full text-16 font-text font-medium leading-normal text-ink-400">
              {props.confirm_text}
              {props.question_text ? (
                <>
                  <br />
                  <span className="text-ink-900">{props.question_text}</span>
                </>
              ) : null}
            </p>
          ) : null}

          {actions.length ? (
            <div className="flex w-full items-start gap-3">
              {actions.map((action, i) => (
                <button
                  key={action.value}
                  type="button"
                  disabled={disabled || action.disabled}
                  onClick={() => act(action.value, action.label)}
                  className={cn(
                    "relative flex h-10 min-w-0 flex-1 items-center justify-center gap-2 overflow-clip rounded-md px-3 py-2",
                    "text-16 font-text font-medium whitespace-nowrap",
                    actionClass(i, actions.length, action.value),
                    disabled && "cursor-not-allowed opacity-60",
                  )}
                >
                  {action.label}
                  {i === actions.length - 1 ? (
                    <span
                      aria-hidden
                      className="pointer-events-none absolute inset-0 rounded-[inherit] shadow-inset-glow"
                    />
                  ) : null}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </CardShell>
  );
}
