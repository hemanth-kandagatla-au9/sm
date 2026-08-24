/**
 * shell/AppShell.tsx — Figma "Landing Screen/ Single CR" (59525:9716).
 * DISPOSABLE. See DECISIONS.md D12.
 *
 * The artboard is a fixed 1512×982. This adapts it to the viewport: the rail
 * (92), sidebar (228) and header bands (88) keep their designed sizes because
 * they are fixed in the design; the chat column takes the remaining space and
 * scrolls, which the artboard could not express.
 *
 * `children` is where agent-driven cards land. Everything above the children
 * slot is ours; everything inside it comes from the contract.
 */
import { IconRail } from "./IconRail";
import { AgentSidebar } from "./AgentSidebar";
import { AppHeader, ChatHeader } from "./AppHeader";
import { Composer } from "./Composer";

export function AppShell({
  chatTitle,
  onStartCr,
  onSend,
  beforeComposer,
  children,
}: {
  chatTitle?: string;
  onStartCr?: () => void;
  onSend?: (value: string) => void;
  /**
   * Sits between the scrolling area and the composer, matching the design's
   * bottom group (59525:9756). The landing screen puts the agent tiles here;
   * once the agent takes over, nothing does.
   */
  beforeComposer?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-screen overflow-hidden bg-linear-to-t from-canvas-from to-canvas-to">
      <IconRail />
      <AgentSidebar onStartCr={onStartCr} />

      <div className="flex min-w-0 flex-1 flex-col">
        <AppHeader />
        <ChatHeader title={chatTitle} />

        <div className="flex min-h-0 flex-1 flex-col justify-between px-6 pb-6 pt-8">
          <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
          {/* gap-6 is the design's 24px between the tiles group and the composer. */}
          <div className="flex w-full shrink-0 flex-col gap-6 pt-6">
            {beforeComposer}
            <Composer onSend={onSend} />
          </div>
        </div>
      </div>
    </div>
  );
}
