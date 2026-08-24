/**
 * shell/useShellStore.ts
 *
 * UI state for the disposable shell — which panels are open, what is typed in
 * the agent search. DISPOSABLE (see DECISIONS.md D12): the platform team owns
 * these surfaces and has their own store for them.
 *
 * Zustand rather than useState-and-prop-drilling because the rail and the
 * sidebar each need to read and write the other's collapsed state (the rail's
 * expand chevron lives in one and affects the layout of both), and because it
 * matches the platform app's convention (`store/useChatStore.ts`).
 *
 * Nothing agent-related belongs here. Agent-driven state arrives over AG-UI and
 * is resolved by `agent-ui/`, which must not import this file.
 */
import { create } from "zustand";

/** Agents shown in the sidebar. Only CR/CO is in scope — see DECISIONS.md D16. */
export const AGENT_IDS = ["sasa", "workshop", "crco"] as const;
export type AgentId = (typeof AGENT_IDS)[number];

interface ShellState {
  /** The 92px icon rail expands to 228px with labels (Figma 56759:62491). */
  railExpanded: boolean;
  /** The 228px agent sidebar collapses to 92px icons (Figma 57320:70529). */
  sidebarCollapsed: boolean;
  /** Which agent rows are expanded. CR/CO starts open — it is the flow entry. */
  expandedAgents: Record<AgentId, boolean>;
  recentsExpanded: boolean;
  agentSearch: string;

  toggleRail: () => void;
  toggleSidebar: () => void;
  toggleAgent: (id: AgentId) => void;
  toggleRecents: () => void;
  setAgentSearch: (value: string) => void;
}

export const useShellStore = create<ShellState>((set) => ({
  railExpanded: false,
  sidebarCollapsed: false,
  expandedAgents: { sasa: false, workshop: false, crco: true },
  recentsExpanded: true,
  agentSearch: "",

  toggleRail: () => set((s) => ({ railExpanded: !s.railExpanded })),
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  toggleAgent: (id) =>
    set((s) => ({ expandedAgents: { ...s.expandedAgents, [id]: !s.expandedAgents[id] } })),
  toggleRecents: () => set((s) => ({ recentsExpanded: !s.recentsExpanded })),
  setAgentSearch: (agentSearch) => set({ agentSearch }),
}));
