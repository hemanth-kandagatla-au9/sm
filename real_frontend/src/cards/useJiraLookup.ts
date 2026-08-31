/**
 * cards/useJiraLookup.ts
 *
 * The Jira pre-fill rules, exactly as the backend team specified them. Kept out
 * of the card because every one of these is a decision with a reason, and they
 * are easier to see — and to test — on their own.
 *
 *   1. Typing fires nothing.
 *   2. 600 ms after the last keystroke, **or immediately on blur** — leaving the
 *      field means the user is done — the value is tested against JIRA_KEY_RE.
 *   3. Only a matching key calls the endpoint. A half-typed key produces no
 *      request and **no error**: it is not a mistake yet, and colouring it red
 *      while someone is mid-word is just noise.
 *   4. Requests are sequence-numbered. A slow response for an old key is
 *      discarded rather than allowed to overwrite a newer one — otherwise typing
 *      two keys quickly can leave the form showing the first one's data.
 *
 * Rule 5 — "fill only where the user has not typed their own text" — lives in
 * the card, because only the card knows what is currently in those fields.
 */
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiGet, JIRA_DEBOUNCE_MS, JIRA_KEY_RE } from "@/agent-ui/config";

export interface JiraLookupResult {
  found: boolean;
  reason_for_change?: string;
  description_of_change?: string;
  /** False when the LLM step failed and the raw Jira text was used instead. */
  generated?: boolean;
  note?: string | null;
  error?: string;
}

export type JiraStatus = "idle" | "loading" | "found" | "not-found" | "error";

export function useJiraLookup(onFound: (r: JiraLookupResult) => void) {
  const [status, setStatus] = useState<JiraStatus>("idle");
  const [message, setMessage] = useState<string | null>(null);

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Monotonic request id; only the newest response is allowed to land. */
  const seq = useRef(0);
  /** The last key we actually issued a request for, to avoid duplicate fetches. */
  const lastQueried = useRef<string | null>(null);
  // Latest-ref: the callback is read only from an async continuation, never
  // during render, so it is synced in an effect rather than assigned inline.
  const onFoundRef = useRef(onFound);
  useEffect(() => {
    onFoundRef.current = onFound;
  });

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const run = useCallback(async (key: string) => {
    const trimmed = key.trim();

    // Rule 3: not a Jira key yet — no request, and crucially no error state.
    if (!JIRA_KEY_RE.test(trimmed)) {
      setStatus("idle");
      setMessage(null);
      return;
    }
    if (trimmed === lastQueried.current) return;

    lastQueried.current = trimmed;
    const mine = ++seq.current;
    setStatus("loading");
    setMessage(null);

    try {
      const data = await apiGet<JiraLookupResult>(
        `/jira-lookup?jira_id=${encodeURIComponent(trimmed)}`,
      );
      if (mine !== seq.current) return; // Rule 4: superseded.

      if (data.found) {
        setStatus("found");
        setMessage(data.note ?? null);
        onFoundRef.current(data);
      } else {
        setStatus("not-found");
        setMessage(data.error ?? "No matching Jira ticket.");
      }
    } catch (err) {
      if (mine !== seq.current) return;
      setStatus("error");
      setMessage(err instanceof Error ? err.message : "Jira lookup failed.");
    }
  }, []);

  /** Call on every keystroke. Schedules, never fires immediately. */
  const onType = useCallback(
    (value: string) => {
      if (timer.current) clearTimeout(timer.current);
      // A cleared or shortened field should drop any stale verdict.
      if (!JIRA_KEY_RE.test(value.trim())) {
        setStatus("idle");
        setMessage(null);
        lastQueried.current = null;
      }
      timer.current = setTimeout(() => run(value), JIRA_DEBOUNCE_MS);
    },
    [run],
  );

  /** Call on blur. Fires now and cancels the pending debounce. */
  const onBlurNow = useCallback(
    (value: string) => {
      if (timer.current) clearTimeout(timer.current);
      void run(value);
    },
    [run],
  );

  const reset = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    seq.current++;
    lastQueried.current = null;
    setStatus("idle");
    setMessage(null);
  }, []);

  return { status, message, onType, onBlurNow, reset };
}
