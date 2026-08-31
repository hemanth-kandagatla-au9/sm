/**
 * shell/Composer.tsx — Figma 59525:9759. DISPOSABLE.
 *
 * On the landing frame the whole composer sits at opacity 40% with a grey Send
 * (#d1d6dd). That is the empty-input state. The design set does not include an
 * active-composer frame at this node, so the enabled treatment — full opacity,
 * brand Send — is INFERRED. Flagged in DECISIONS.md; to be confirmed against the
 * CR-form frames, which do show a live composer.
 */
"use client";

import { useState } from "react";
import { Icon } from "@/ui/Icon";
import { cn } from "@/lib/cn";

export function Composer({
  placeholder = "Ask about Project, Generate specifications, or ask me a task...",
  onSend,
  disabled = false,
}: {
  placeholder?: string;
  onSend?: (value: string) => void;
  disabled?: boolean;
}) {
  const [value, setValue] = useState("");
  const canSend = value.trim().length > 0 && !disabled;

  function submit() {
    if (!canSend) return;
    onSend?.(value.trim());
    setValue("");
  }

  return (
    <div className="flex w-full flex-col gap-3">
      <div
        className={cn(
          "flex w-full flex-col items-start justify-center transition-opacity",
          canSend ? "opacity-100" : "opacity-40",
        )}
      >
        <div className="flex w-full flex-col items-start overflow-clip rounded-xl border border-line bg-surface px-6 py-4">
          <div className="flex w-full items-center gap-3">
            <button type="button" aria-label="Attach a file" className="flex items-center">
              <Icon src="attach.svg" width={24} height={24} />
            </button>

            <input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  submit();
                }
              }}
              disabled={disabled}
              placeholder={placeholder}
              aria-label="Message"
              className="min-w-0 flex-1 bg-transparent text-14 font-text font-medium leading-normal tracking-normal text-ink-900 outline-none placeholder:text-ink-200"
            />

            <button
              type="button"
              onClick={submit}
              disabled={!canSend}
              className={cn(
                "relative flex h-10 shrink-0 items-center justify-center gap-2 overflow-clip rounded-md px-3 py-2",
                canSend ? "bg-brand" : "bg-disabled",
              )}
            >
              <span className="text-16 font-text font-medium leading-normal tracking-normal text-white whitespace-nowrap">
                Send
              </span>
              <Icon src="send-arrow.svg" width={20} height={20} />
              <span
                aria-hidden
                className="pointer-events-none absolute inset-0 rounded-[inherit] shadow-inset-glow"
              />
            </button>
          </div>
        </div>
      </div>

      <p className="w-full text-center text-16 font-text leading-normal tracking-normal text-ink-300">
        AI SDLC can make mistakes. Verify important info.{" "}
        <a href="#" className="font-medium text-ink-500 underline decoration-solid">
          Privacy Policy
        </a>
      </p>
    </div>
  );
}
