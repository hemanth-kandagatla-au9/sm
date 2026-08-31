import { notFound } from "next/navigation";
import { CardGallery } from "./CardGallery";

/**
 * /dev/cards — every contract component, rendered from the backend's own
 * example payload, with no agent running.
 *
 * This is the surface the cards are built against. Because the fixtures are
 * generated from `ui-contract.json` rather than hand-written, "it looks right in
 * the gallery" means it looks right against what the backend actually sends —
 * not against what someone assumed it sends.
 *
 * While the registry is partial, the unimplemented names render `FallbackCard`.
 * That is the point: the failure path is visible from the first day rather than
 * discovered in QA, and the gallery fills in as Steps 5 and 6 land.
 *
 * 404 in production, like /dev/tokens.
 */
export default function CardsPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <CardGallery />;
}
