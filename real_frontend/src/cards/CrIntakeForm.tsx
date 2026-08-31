/**
 * cards/CrIntakeForm.tsx — Figma 59525:10251. Contract component `crIntakeForm`.
 *
 * Screen 1 of the flow. Six fields, two of them dropdowns, one with a debounced
 * Jira lookup that pre-fills two others.
 *
 * ── What this card submits ──────────────────────────────────────────────────
 * `node_0_wait` passes the response straight to `node_1` as a HumanMessage, and
 * node_1 extracts field values from it with an LLM. So the payload is labelled
 * natural language, not a rigid schema — but it is written in a stable, labelled
 * form anyway, because "the LLM will probably cope" is a poor reason to hand it
 * something sloppy.
 *
 * ── What it does not do ─────────────────────────────────────────────────────
 * No client-side validation beyond "platform is required" (the only field the
 * design marks with an asterisk). Everything else is the agent's judgement, and
 * the server re-validates regardless. Field errors arrive back through
 * `props.errors` and render on the field they belong to.
 */
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AgentCardProps } from "@/agent-ui/types";
import type { CrIntakeValues } from "@/agent-ui/contract.generated";
import { apiGet } from "@/agent-ui/config";
import { CardShell } from "./CardShell";
import { Field, type FieldState } from "./Field";
import { useJiraLookup, type JiraLookupResult } from "./useJiraLookup";
import { Icon } from "@/ui/Icon";
import { cn } from "@/lib/cn";

type FormValues = Required<{ [K in keyof CrIntakeValues]: string }>;

/** Field order and labels exactly as the design lays them out. */
const LABELS: Record<keyof FormValues, string> = {
  platform: "Platform",
  target_system: "Target System",
  jira_id: "Jira ID",
  iris_id: "IRIS ID",
  reason_for_change: "Reason For Change",
  description_of_change: "Description Of Change",
};

function fromProps(values: CrIntakeValues | null | undefined): FormValues {
  return {
    platform: values?.platform ?? "",
    target_system: values?.target_system ?? "",
    jira_id: values?.jira_id ?? "",
    iris_id: values?.iris_id ?? "",
    reason_for_change: values?.reason_for_change ?? "",
    description_of_change: values?.description_of_change ?? "",
  };
}

/**
 * The action-row labels.
 *
 * These are HARDCODED because the contract has no props for them — every other
 * word on this card comes from the agent. "Submit" became "Next" at the client's
 * request on 2026-08-30.
 *
 * That is a frontend release for a wording change, which is the wrong shape. The
 * fix is `submit_label` / `cancel_label` on `crIntakeFormProps`; raised with the
 * backend team and recorded in docs/GAPS.md. Until then these two constants are
 * the whole surface — one place to change, and one place to delete when the
 * props land.
 */
const SUBMIT_LABEL = "Next";
const CANCEL_LABEL = "Cancel";

export function CrIntakeForm({ props, respond, pending }: AgentCardProps<"crIntakeForm">) {
  const initial = useMemo(() => fromProps(props.values), [props.values]);
  const [values, setValues] = useState<FormValues>(initial);
  const [submitted, setSubmitted] = useState(false);

  /**
   * Which fields the user has typed in themselves. A Jira lookup fills only the
   * ones they have not touched — hand edits are never overwritten by a later
   * response.
   */
  const touched = useRef<Set<keyof FormValues>>(new Set());

  /**
   * Target systems keyed by the platform they were fetched for. Keeping the
   * platform alongside the list means a response that arrives after the user has
   * already switched platform is simply ignored, rather than briefly showing the
   * wrong system list — the same superseded-response problem the Jira lookup
   * solves with sequence numbers.
   */
  const [targets, setTargets] = useState<{ platform: string; list: string[] } | null>(null);

  const set = useCallback((key: keyof FormValues, value: string) => {
    touched.current.add(key);
    setValues((v) => ({ ...v, [key]: value }));
  }, []);

  // ── Jira pre-fill ─────────────────────────────────────────────────────────
  const onJiraFound = useCallback((r: JiraLookupResult) => {
    setValues((v) => ({
      ...v,
      reason_for_change: touched.current.has("reason_for_change")
        ? v.reason_for_change
        : (r.reason_for_change ?? v.reason_for_change),
      description_of_change: touched.current.has("description_of_change")
        ? v.description_of_change
        : (r.description_of_change ?? v.description_of_change),
    }));
  }, []);

  const jira = useJiraLookup(onJiraFound);

  // ── Target systems, fetched per platform ──────────────────────────────────
  // The contract supplies these only when already known; otherwise they come
  // from the REST helper, which is why picking a platform populates the second
  // dropdown rather than the agent having to preload every combination.
  const platform = values.platform.trim();

  useEffect(() => {
    if (!platform) return;
    const ctrl = new AbortController();
    apiGet<{ target_systems: string[] }>(
      `/target-systems?platform=${encodeURIComponent(platform)}`,
      ctrl.signal,
    )
      .then((d) => setTargets({ platform, list: d.target_systems ?? [] }))
      // A dead lookup must not break the form — the field stays typable and the
      // agent validates the value anyway.
      .catch(() => {
        if (!ctrl.signal.aborted) setTargets({ platform, list: [] });
      });
    return () => ctrl.abort();
  }, [platform]);

  // Derived rather than stored, so no state update happens during the effect.
  const targetSystems = platform
    ? targets?.platform === platform
      ? targets.list
      : []
    : (props.target_systems ?? []);
  const targetsLoading = platform !== "" && targets?.platform !== platform;

  // ── Derived state ─────────────────────────────────────────────────────────
  const errors = props.errors ?? {};
  const anyFilled = Object.values(values).some((v) => v.trim().length > 0);
  const canSubmit = pending && values.platform.trim().length > 0 && !submitted;

  function stateFor(key: keyof FormValues): FieldState {
    if (errors[key]) return "error";
    if (key === "jira_id") {
      if (jira.status === "found") return "verified";
      if (jira.status === "not-found") return "missing";
      if (jira.status === "error") return "error";
    }
    return "default";
  }

  function helperFor(key: keyof FormValues): string | null {
    if (errors[key]) return errors[key];
    if (key === "jira_id" && jira.message) return jira.message;
    if (key === "jira_id" && jira.status === "found") return "Jira ticket found.";
    if (key === "iris_id" && !props.iris_enabled) return "IRIS lookup is not available yet.";
    return null;
  }

  function reset() {
    touched.current.clear();
    jira.reset();
    setValues(initial);
  }

  function submit() {
    if (!canSubmit) return;
    const lines = (Object.keys(LABELS) as (keyof FormValues)[])
      .filter((k) => values[k].trim())
      .map((k) => `${LABELS[k]}: ${values[k].trim()}`);
    setSubmitted(true);
    /*
     * The payload is the multi-line message the graph parses. The transcript
     * label is not: echoing a dozen field lines back as a chat bubble would bury
     * the conversation under a form dump, and those values are already visible
     * in the locked card directly above it.
     */
    respond(
      ["Create a change request.", ...lines].join("\n"),
      "Change request details submitted",
    );
  }

  const disabled = !pending || submitted;

  return (
    <CardShell meta={props.meta}>
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex w-full items-start justify-between gap-6">
        <div className="flex flex-col justify-center gap-2">
          <p className="text-16 font-text font-medium text-ink-900">{props.title}</p>
          {props.subtitle ? (
            <p className="text-16 font-text text-ink-500">{props.subtitle}</p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={reset}
          disabled={disabled}
          className="flex shrink-0 items-center gap-2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Icon src="reset.svg" width={20} height={20} />
          <span className="text-16 font-text text-brand whitespace-nowrap">Reset Form</span>
        </button>
      </div>

      {/* ── Fields ─────────────────────────────────────────────────────── */}
      <div className="flex w-full flex-col gap-5">
        <div className="flex w-full flex-col gap-4">
          <div className="flex w-full items-start gap-3">
            <Field
              id="platform"
              label={LABELS.platform}
              required
              options={props.platforms}
              placeholder="Select Platform"
              value={values.platform}
              onChange={(v) => {
                touched.current.delete("target_system");
                setValues((s) => ({ ...s, platform: v, target_system: "" }));
              }}
              state={stateFor("platform")}
              helper={helperFor("platform")}
              disabled={disabled}
            />
            <Field
              id="target_system"
              label={LABELS.target_system}
              options={targetSystems}
              placeholder={targetsLoading ? "Loading…" : "Select Target System"}
              value={values.target_system}
              onChange={(v) => set("target_system", v)}
              state={stateFor("target_system")}
              helper={helperFor("target_system")}
              disabled={disabled || !values.platform}
            />
          </div>

          <div className="flex w-full flex-col gap-4">
            {props.hint ? (
              <p className="text-16 font-text text-ink-600">{props.hint}</p>
            ) : null}

            <div className="flex w-full flex-col gap-3">
              <div className="flex w-full items-start gap-3">
                <Field
                  id="jira_id"
                  label={LABELS.jira_id}
                  placeholder="Enter Jira ID"
                  value={values.jira_id}
                  onChange={(v) => {
                    set("jira_id", v);
                    jira.onType(v);
                  }}
                  onBlur={(v) => jira.onBlurNow(v)}
                  state={stateFor("jira_id")}
                  helper={helperFor("jira_id")}
                  disabled={disabled}
                />
                <Field
                  id="iris_id"
                  label={LABELS.iris_id}
                  placeholder="Enter Iris ID"
                  value={values.iris_id}
                  onChange={(v) => set("iris_id", v)}
                  state={stateFor("iris_id")}
                  helper={helperFor("iris_id")}
                  // IRIS has no backing API yet. Rendered per the design but
                  // inert until `iris_enabled` flips server-side — no frontend
                  // change needed then.
                  disabled={disabled || !props.iris_enabled}
                />
              </div>

              <div className="flex w-full items-start gap-3">
                <Field
                  id="reason_for_change"
                  label={LABELS.reason_for_change}
                  placeholder="Enter Reason"
                  value={values.reason_for_change}
                  onChange={(v) => set("reason_for_change", v)}
                  state={stateFor("reason_for_change")}
                  helper={helperFor("reason_for_change")}
                  disabled={disabled}
                  // Both routinely hold a paragraph, and the Jira lookup fills
                  // them with one. A single-line input shows a paragraph through
                  // a slot, and this text ends up in a change request someone
                  // approves.
                  multiline
                />
                <Field
                  id="description_of_change"
                  label={LABELS.description_of_change}
                  placeholder="Enter Description"
                  value={values.description_of_change}
                  onChange={(v) => set("description_of_change", v)}
                  state={stateFor("description_of_change")}
                  helper={helperFor("description_of_change")}
                  disabled={disabled}
                  // Both routinely hold a paragraph, and the Jira lookup fills
                  // them with one. A single-line input shows a paragraph through
                  // a slot, and this text ends up in a change request someone
                  // approves.
                  multiline
                />
              </div>
            </div>
          </div>
        </div>

        {/* ── Footer ───────────────────────────────────────────────────── */}
        <div className="flex w-full items-center justify-between gap-3">
          <p className="text-12 font-text text-ink-600">
            {anyFilled ? "" : "No information filled"}
          </p>
          <div className="flex shrink-0 items-center gap-3">
            <button
              type="button"
              onClick={reset}
              disabled={disabled}
              className="flex h-10 w-[8.375rem] items-center justify-center gap-2 rounded-md border border-line bg-surface disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span className="text-16 font-text font-medium text-ink-600">{CANCEL_LABEL}</span>
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={!canSubmit}
              className={cn(
                "relative flex h-10 w-[8.375rem] items-center justify-center gap-2 overflow-clip rounded-md",
                canSubmit ? "bg-btn-primary" : "bg-disabled",
              )}
            >
              <span className="text-16 font-text font-medium text-surface">{SUBMIT_LABEL}</span>
              <span
                aria-hidden
                className="pointer-events-none absolute inset-0 rounded-[inherit] shadow-inset-glow"
              />
            </button>
          </div>
        </div>
      </div>
    </CardShell>
  );
}
