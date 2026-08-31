/**
 * shell/AgentSidebar.tsx — Figma "Side Navigation-02" (57320:70531).
 *
 * Two variants, both from the design:
 *   Expanded   (57320:70530)  228px — New Chat, search, agent list, recents
 *   Collapsed  (57320:70529)   92px — spark, agent chips, recents calendar
 *
 * DISPOSABLE. See DECISIONS.md D12.
 *
 * The one control here that matters is "Create Change Request" under CR/CO —
 * everything else is context. Per D16, SASA and Workshop Assist are out of
 * scope: their rows and chevrons render exactly as designed but do not expand,
 * because the design defines no children for them and inventing some would be
 * building a flow nobody has specified.
 */
"use client";

import { Icon } from "@/ui/Icon";
import { Tip } from "@/ui/Tooltip";
import { cn } from "@/lib/cn";
import { useShellStore, type AgentId } from "./useShellStore";

interface Agent {
  id: AgentId;
  name: string;
  icon: string;
  iconSize: 16 | 20;
  chip: string;
  /** Only CR/CO has designed children, so only CR/CO expands. */
  expandable: boolean;
}

const AGENTS: Agent[] = [
  {
    id: "sasa",
    name: "SASA",
    icon: "agent-sasa.svg",
    iconSize: 16,
    chip: "bg-chip-blue",
    expandable: false,
  },
  {
    id: "workshop",
    name: "Workshop Assist",
    icon: "agent-workshop.svg",
    iconSize: 16,
    chip: "bg-chip-amber",
    expandable: false,
  },
  {
    id: "crco",
    name: "CR/CO Agent",
    icon: "agent-crco.svg",
    iconSize: 20,
    chip: "bg-chip-green",
    expandable: true,
  },
];

function AgentChip({ agent }: { agent: Agent }) {
  return (
    <span
      className={cn(
        "flex items-center overflow-clip rounded-chip p-[0.3125rem]",
        agent.chip,
        agent.iconSize === 20 && "size-[1.625rem] justify-center",
      )}
    >
      <Icon src={agent.icon} width={agent.iconSize} height={agent.iconSize} />
    </span>
  );
}

export function AgentSidebar({
  onStartCr,
  onNewChat,
}: {
  onStartCr?: () => void;
  /** Abandon the current conversation and open a fresh one. */
  onNewChat?: () => void;
}) {
  const collapsed = useShellStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useShellStore((s) => s.toggleSidebar);
  const expandedAgents = useShellStore((s) => s.expandedAgents);
  const toggleAgent = useShellStore((s) => s.toggleAgent);
  const recentsExpanded = useShellStore((s) => s.recentsExpanded);
  const toggleRecents = useShellStore((s) => s.toggleRecents);
  const search = useShellStore((s) => s.agentSearch);
  const setSearch = useShellStore((s) => s.setAgentSearch);

  const query = search.trim().toLowerCase();
  const visible = query
    ? AGENTS.filter((a) => a.name.toLowerCase().includes(query))
    : AGENTS;

  return (
    <aside
      className={cn(
        "flex h-full shrink-0 flex-col gap-5 overflow-clip bg-surface px-2.5 pb-[1.125rem]",
        "transition-[width] duration-200 ease-out",
        // The two variants carry different right borders in the design.
        collapsed
          ? "w-rail border-r border-line-faint"
          : "w-sidebar border-r-[0.5px] border-line-soft",
      )}
    >
      {/* ── Header band ─────────────────────────────────────────────────── */}
      <div
        className={cn(
          "flex h-header w-full shrink-0 items-center justify-center gap-4 border-b border-line-faint",
          collapsed ? "py-4" : "p-4",
        )}
      >
        <div className="flex h-full min-w-0 flex-1 items-center justify-between">
          {collapsed ? (
            <Tip label="New chat">
              <button
                type="button"
                onClick={onNewChat}
                aria-label="New chat"
                className="relative flex h-full items-center overflow-clip rounded-md bg-surface px-3 py-2"
              >
                <Icon src="spark-collapsed.svg" width={20} height={20} />
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-0 rounded-[inherit] shadow-inset-glow"
                />
              </button>
            </Tip>
          ) : (
            <button
              type="button"
              onClick={onNewChat}
              className="relative flex h-full w-[7.6875rem] items-center justify-between overflow-clip rounded-md border border-accent-blue bg-surface px-3 py-2"
            >
              <span className="bg-linear-to-l from-accent-blue to-brand bg-clip-text text-16 font-text font-medium leading-normal tracking-normal text-transparent whitespace-nowrap">
                New Chat
              </span>
              <Icon src="newchat-spark.svg" width={20} height={20} />
              <span
                aria-hidden
                className="pointer-events-none absolute -inset-px rounded-[inherit] shadow-inset-glow"
              />
            </button>
          )}

          <button
            type="button"
            onClick={toggleSidebar}
            aria-expanded={!collapsed}
            aria-label={
              collapsed ? "Expand agent panel" : "Collapse agent panel"
            }
            className="shrink-0"
          >
            {collapsed ? (
              <Icon src="expand-right.svg" width={24} height={24} />
            ) : (
              <span className="block -scale-y-100 rotate-180">
                <Icon src="sidebar-collapse.svg" width={24} height={24} />
              </span>
            )}
          </button>
        </div>
      </div>

      {/* ── Body ────────────────────────────────────────────────────────── */}
      <div
        className={cn(
          "flex min-h-0 w-full flex-1 flex-col gap-4 overflow-y-auto",
          collapsed && "items-center justify-start",
        )}
      >
        <div
          className={cn(
            "flex w-full flex-col",
            collapsed ? "items-center" : "gap-3",
          )}
        >
          {collapsed ? (
            <p className="flex h-10 items-center px-3 text-14 font-text font-medium capitalize text-ink-400">
              Agents
            </p>
          ) : (
            <div className="flex w-full flex-col gap-2">
              <p className="text-14 font-text font-medium capitalize text-ink-400">
                Available Agents
              </p>
              <div className="flex h-8 w-full items-center gap-2 rounded-sm border border-line bg-surface px-3 py-1">
                <Icon src="search.svg" width={16} height={16} />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search"
                  aria-label="Search agents"
                  className="min-w-0 flex-1 bg-transparent text-12 font-text capitalize text-ink-900 outline-none placeholder:text-ink-400"
                />
              </div>
            </div>
          )}

          <div
            className={cn(
              "flex w-full flex-col",
              collapsed ? "items-center" : "gap-1",
            )}
          >
            {visible.map((agent) => {
              const open = expandedAgents[agent.id];

              if (collapsed) {
                return (
                  // Collapsed to 92px: the agent is a coloured glyph and nothing
                  // else, so a tooltip is the only thing naming it on screen.
                  <Tip key={agent.id} label={agent.name}>
                    <button
                      type="button"
                      aria-label={agent.name}
                      onClick={agent.id === "crco" ? onStartCr : undefined}
                      className="flex h-10 w-full items-center justify-center px-3"
                    >
                      <AgentChip agent={agent} />
                    </button>
                  </Tip>
                );
              }

              return (
                <div key={agent.id} className="flex w-full flex-col gap-3">
                  <button
                    type="button"
                    onClick={
                      agent.expandable ? () => toggleAgent(agent.id) : undefined
                    }
                    aria-expanded={agent.expandable ? open : undefined}
                    // Out-of-scope agents render their designed chevron but do
                    // not act on it — see the file header and D16.
                    aria-disabled={agent.expandable ? undefined : true}
                    className={cn(
                      "flex h-10 items-center px-3",
                      agent.expandable
                        ? "w-full justify-between"
                        : "w-[13rem] justify-between",
                    )}
                  >
                    <span className="flex items-center gap-3">
                      <AgentChip agent={agent} />
                      <span className="text-16 font-text font-medium text-ink-900 whitespace-nowrap">
                        {agent.name}
                      </span>
                    </span>
                    <Icon
                      src={
                        open ? "agent-chevron-up.svg" : "agent-chevron-down.svg"
                      }
                      width={27}
                      height={16}
                    />
                  </button>

                  {agent.expandable && open ? (
                    <div className="flex w-full flex-col">
                      {/*
                        Truncated to the sidebar width, so the tooltip carries
                        the text the ellipsis removed — the case reported.
                      */}
                      <Tip label="Create Change Request">
                        <button
                          type="button"
                          onClick={onStartCr}
                          className="flex h-10 w-full items-center gap-3 px-6"
                        >
                          <Icon
                            src="doc-create-cr.svg"
                            width={24}
                            height={24}
                          />
                          <span className="truncate text-16 font-text font-medium text-ink-900">
                            Create Change Request
                          </span>
                        </button>
                      </Tip>
                    </div>
                  ) : null}
                </div>
              );
            })}

            {!collapsed && visible.length === 0 ? (
              <p className="px-3 py-2 text-12 font-text text-ink-400">
                No agents match &ldquo;{search.trim()}&rdquo;.
              </p>
            ) : null}
          </div>
        </div>

        {/* ── Recents ───────────────────────────────────────────────────── */}
        <div
          className={cn("flex w-full flex-col", collapsed && "items-center")}
        >
          {collapsed ? (
            <>
              <p className="flex h-10 items-center px-3 text-14 font-text font-medium capitalize text-ink-400">
                Recents
              </p>
              <div className="flex w-full flex-col items-center justify-center gap-3 px-3">
                <button type="button" aria-label="Recent conversations">
                  <Icon src="recents-calendar.svg" width={16} height={16} />
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="flex h-10 items-center text-14 font-text font-medium capitalize text-ink-400">
                recent Conversations
              </p>
              <div className="flex w-[13rem] flex-col gap-2">
                <button
                  type="button"
                  onClick={toggleRecents}
                  aria-expanded={recentsExpanded}
                  className="flex w-full flex-col justify-center gap-0.5 px-3"
                >
                  <span className="flex w-full items-center justify-between">
                    <span className="text-16 font-text font-medium text-ink-900 whitespace-nowrap">
                      TranScend MT 2.0
                    </span>
                    <span
                      className={cn(
                        "block",
                        !recentsExpanded && "-scale-y-100",
                      )}
                    >
                      <Icon src="chevron-recent.svg" width={16} height={16} />
                    </span>
                  </span>
                  <span className="flex items-center gap-1.5 text-10 font-text leading-normal">
                    <span className="text-black/70">11th Feb, 26</span>
                    <span className="text-black/40">21:12 pm</span>
                  </span>
                </button>
                {recentsExpanded ? (
                  <p className="flex h-10 items-center px-3 text-16 font-text text-ink-600">
                    No chats yet
                  </p>
                ) : null}
              </div>
            </>
          )}
        </div>
      </div>
    </aside>
  );
}
