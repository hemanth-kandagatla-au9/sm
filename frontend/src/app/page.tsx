/**
 * The CR/CO demo — Figma 59525:9716 (landing) → 59525:10206 (conversation).
 *
 * Before the agent is started this is the landing screen. Starting it hands
 * control to the graph: from that point every screen comes from the contract,
 * and nothing in this file decides what is shown.
 *
 * Points at the scripted backend by default so the flow runs with nothing else
 * running. Set `NEXT_PUBLIC_AGENT_URL=/api/agent` to talk to `agui_server.py`.
 */
"use client";

import { useState } from "react";
import { AppShell } from "@/shell/AppShell";
import { AgentTiles, Greeting } from "@/shell/Greeting";
import { AgentComponentHost } from "@/agent-ui/AgentComponentHost";
import { useAgentSession } from "@/agent-ui/useAgentSession";

const AGENT_URL = process.env.NEXT_PUBLIC_AGENT_URL ?? "/api/agent/mock?scenario=flow";

export default function Home() {
  const [live, setLive] = useState(false);
  const session = useAgentSession({ url: AGENT_URL });

  function startAgent() {
    setLive(true);
    session.start();
  }

  if (!live) {
    return (
      <AppShell beforeComposer={<AgentTiles onStartCr={startAgent} />} onStartCr={startAgent}>
        <Greeting />
      </AppShell>
    );
  }

  return (
    <AppShell
      chatTitle="Create Change Request"
      onStartCr={startAgent}
      // Free text goes to the same resume channel — `fieldPrompt` accepts it,
      // and the graph decides what to make of it.
      onSend={session.respond}
    >
      <div className="flex w-full flex-col gap-6 pb-4">
        {session.status === "running" && session.resolution.status === "empty" ? (
          <p className="text-16 font-text text-ink-500">Starting the agent…</p>
        ) : null}

        {session.error ? (
          <p className="text-16 font-text text-error">{session.error}</p>
        ) : null}

        <AgentComponentHost resolution={session.resolution} respond={session.respond} />
      </div>
    </AppShell>
  );
}
