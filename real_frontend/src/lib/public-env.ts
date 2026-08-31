/**
 * lib/public-env.ts — the values the browser is allowed to know.
 *
 * Everything here is compiled into the JavaScript bundle and is readable by
 * anyone with the page open. That is not a leak; it is the contract. Nothing
 * secret, and no backend hosts — the browser is told a same-origin path and
 * nothing about what sits behind it.
 *
 * The references below are written out in full on purpose.
 * `process.env[someVariable]` is NOT inlined by the bundler and silently
 * evaluates to `undefined` in the browser; only a literal
 * `process.env.NEXT_PUBLIC_X` is replaced at build time.
 */
export const publicEnv = Object.freeze({
  /** Same-origin route the AG-UI client posts to. */
  agentPath: process.env.NEXT_PUBLIC_AGENT_PATH ?? "/api/agent",

  /** Must match `LangGraphAGUIAgent(name=...)` in agui_server.py. */
  agentName: process.env.NEXT_PUBLIC_AGUI_AGENT_NAME ?? "local_agent",
});
