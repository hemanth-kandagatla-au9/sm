import { notFound } from "next/navigation";
import { Primitives } from "./Primitives";

/**
 * /dev/primitives — every shared component, in every designed state.
 *
 * The states that matter most are the ones a happy path never reaches: an error
 * field, a missing field, a disabled option. Driving a real graph to produce
 * them is slow enough that in practice nobody checks them. Here they are always
 * on screen.
 *
 * 404 in production.
 */
export default function PrimitivesPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <Primitives />;
}
