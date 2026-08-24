/**
 * shell/AppHeader.tsx — Figma "Header" (59525:9735) and the chat band below it
 * (59525:9736). Both are 88px and both are DISPOSABLE.
 */
import { Icon } from "./Icon";

export function AppHeader({
  title = "AI SDLC Orchestration",
  project = "Projects",
  workspace = "Treasury",
  userName = "Kelvin Johnson",
  userRole = "Admin User",
}: {
  title?: string;
  project?: string;
  workspace?: string;
  userName?: string;
  userRole?: string;
}) {
  return (
    <header className="flex h-header w-full shrink-0 items-center justify-center overflow-clip border-b border-line bg-surface px-6 py-4">
      <div className="flex min-w-0 flex-1 items-center justify-between">
        <div className="flex flex-col gap-3">
          <h1 className="text-24 font-display font-medium leading-[1.2] tracking-normal text-ink-900 whitespace-nowrap">
            {title}
          </h1>
          <nav aria-label="Breadcrumb" className="flex items-center gap-1">
            <span className="text-16 font-text font-medium leading-normal tracking-normal text-ink-600">
              {project}
            </span>
            <Icon src="chevron-right.svg" width={16} height={16} />
            <span className="text-16 font-text font-medium leading-normal tracking-normal text-brand">
              {workspace}
            </span>
          </nav>
        </div>

        <button
          type="button"
          className="flex h-12 w-[188px] shrink-0 items-center gap-3 overflow-clip rounded-md border-[0.5px] border-line-ghost bg-surface p-2 shadow-card"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/shell/avatar.png"
            width={32}
            height={32}
            alt=""
            aria-hidden
            className="size-8 shrink-0 rounded-full object-cover"
          />
          <span className="flex flex-col justify-center gap-2 text-left leading-6">
            <span className="text-14 font-display font-medium text-ink-800 whitespace-nowrap">
              {userName}
            </span>
            <span className="text-12 font-text text-ink-250">{userRole}</span>
          </span>
          <Icon src="persona-chevron.svg" width={16} height={16} />
        </button>
      </div>
    </header>
  );
}

export function ChatHeader({
  title = "New Chat",
  role = "Project Owner",
}: {
  title?: string;
  role?: string;
}) {
  return (
    <div className="flex w-full shrink-0 items-center justify-between overflow-clip border-b border-line bg-surface px-6 py-4">
      <h2 className="text-24 font-display font-medium text-ink-900 whitespace-nowrap">{title}</h2>
      <div className="flex h-10 shrink-0 items-center gap-2 rounded-md border-[0.5px] border-line bg-surface p-1.5">
        <span className="text-16 font-text font-medium leading-normal tracking-normal text-ink-600 whitespace-nowrap">
          Role Selected
        </span>
        <button
          type="button"
          className="flex h-full items-center gap-2 rounded-sm border-[0.5px] border-line bg-surface-tint px-2 py-1"
        >
          <span className="text-16 font-text font-medium leading-normal tracking-normal text-ink-900 whitespace-nowrap">
            {role}
          </span>
          <Icon src="chevron-role.svg" width={16} height={16} />
        </button>
      </div>
    </div>
  );
}
