import { notFound } from "next/navigation";
import { Session } from "./Session";

/** /dev/session — the transport and transcript, driven against the mock. 404 in production. */
export default function SessionPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <Session />;
}
