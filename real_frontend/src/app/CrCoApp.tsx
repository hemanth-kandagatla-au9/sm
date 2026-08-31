/**
 * app/CrCoApp.tsx — the client half of the home route.
 *
 * Figma 59525:9716 (landing) → 59525:10206 (conversation).
 *
 * Before the agent starts, this is the landing screen. Starting it hands control
 * to the graph: from that point every card comes from the contract, and nothing
 * in this file decides what is shown. The only thing this file chooses is
 * landing-versus-conversation.
 */
"use client";

import { useState } from "react";
import { useAgentSession } from "@/agent-ui/useAgentSession";
import { AppShell } from "@/shell/AppShell";
import { AgentTiles, Greeting } from "@/shell/Greeting";
import { Transcript } from "@/shell/Transcript";
import { publicEnv } from "@/lib/public-env";

/**
 * Placeholder until authentication lands, and deliberately in one place: this is
 * the only thing the UI needs from an identity provider today, so wiring MSAL
 * later is one function, not a search. See docs/GAPS.md G11.
 */
const CURRENT_USER = "Kelvin Johnson";

export function CrCoApp() {
  const [live, setLive] = useState(false);
  const session = useAgentSession({ url: publicEnv.agentPath });

  function startAgent() {
    setLive(true);
    session.start();
  }

  /**
   * New Chat — abandon this change request and begin another.
   *
   * `restart` rather than `start`: the transcript, the stored copy of it and the
   * thread id all have to go, or the graph would resume the previous
   * conversation from wherever it had reached.
   */
  function newChat() {
    setLive(true);
    session.restart();
  }

  if (!live) {
    return (
      <AppShell
        beforeComposer={<AgentTiles onStartCr={startAgent} />}
        onStartCr={startAgent}
        onNewChat={newChat}
      >
        <div className="h-full overflow-y-auto">
          <Greeting />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell
      chatTitle="Create Change Request"
      onStartCr={startAgent}
      onNewChat={newChat}
      // Free text goes to the same resume channel — `fieldPrompt` accepts it,
      // and the graph decides what to make of it.
      onSend={session.respond}
    >
      {session.turns.length === 0 ? (
        <div className="flex h-full flex-col gap-3 p-2">
          {session.status === "running" && (
            <p className="text-16 font-text text-ink-500">Starting the agent…</p>
          )}
          {session.error && (
            <p role="alert" className="text-16 font-text text-error">
              {session.error}
            </p>
          )}
        </div>
      ) : (
        <Transcript
          turns={session.turns}
          respond={session.respond}
          userName={CURRENT_USER}
          busy={session.status === "running"}
        />
      )}
    </AppShell>
  );
}
