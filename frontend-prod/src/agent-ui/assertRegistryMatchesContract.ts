/**
 * agent-ui/assertRegistryMatchesContract.ts
 *
 * Dev-time drift check between what the agent can emit and what this app can
 * render. Runs in the browser console rather than in CI because the failure it
 * catches — a backend that added a component we have not registered — is a
 * deployment-time mismatch, not a build-time one. The two sides ship
 * independently; that is the point of the contract.
 *
 * Drift shows up here immediately instead of as a fallback card in QA.
 */
import { COMPONENT_NAMES } from "./contract.generated";
import { REGISTRY } from "./registry";
import type { Registry } from "./types";

export interface DriftReport {
  /** In the contract, no card here. Expected during build-out. */
  unimplemented: string[];
  /** Registered here, absent from the contract. Always a bug. */
  orphaned: string[];
  implemented: string[];
}

export function contractDrift(registry: Registry = REGISTRY): DriftReport {
  const contract = new Set<string>(COMPONENT_NAMES);
  const registered = Object.keys(registry).filter(
    (k) => registry[k as keyof Registry] != null,
  );

  return {
    unimplemented: COMPONENT_NAMES.filter((n) => !registered.includes(n)),
    orphaned: registered.filter((n) => !contract.has(n)),
    implemented: registered.filter((n) => contract.has(n)),
  };
}

export function assertRegistryMatchesContract(registry: Registry = REGISTRY): DriftReport {
  const report = contractDrift(registry);

  if (process.env.NODE_ENV !== "production") {
    const { implemented, unimplemented, orphaned } = report;
    console.info(
      `[agent-ui] contract: ${implemented.length}/${COMPONENT_NAMES.length} components implemented`,
    );
    if (unimplemented.length) {
      console.info(`[agent-ui] not built yet: ${unimplemented.join(", ")}`);
    }
    // Orphans are the real signal: a name we render that the agent can never
    // send is either a typo or a component the backend removed.
    if (orphaned.length) {
      console.error(
        `[agent-ui] REGISTRY DRIFT — registered but absent from the contract: ${orphaned.join(", ")}. ` +
          `Re-run "npm run contract:pull && npm run contract:gen".`,
      );
    }
  }

  return report;
}
