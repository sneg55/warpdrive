import { redirect } from "next/navigation";
import { STRINGS } from "@/constants/strings";
import type { RouterOutputs } from "@/lib/trpc-client";
import { createContext } from "@/server/trpc/context";
import { createCaller } from "@/server/trpc/root";
import { InboxThreadClient } from "./InboxThreadClient";

export const metadata = { title: STRINGS.inbox.title };

export default async function InboxThreadPage({
  params,
}: {
  params: Promise<{ threadId: string }>;
}): Promise<React.ReactNode> {
  const { threadId } = await params;
  const ctx = await createContext();
  if (ctx.actor === null) {
    redirect("/login");
  }
  // Prefetch the thread server-side so the reader paints immediately instead of waiting on a
  // client round trip. Best-effort: on any error (not found / no access) fall back to the client
  // fetch, which renders the same not-found / error state.
  let initialThread: RouterOutputs["email"]["thread"]["get"] | undefined;
  try {
    initialThread = await createCaller(ctx).email.thread.get({ threadId, allowRemote: false });
  } catch {
    initialThread = undefined;
  }
  return (
    <InboxThreadClient
      threadId={threadId}
      selfActorId={ctx.actor.id}
      initialThread={initialThread}
    />
  );
}
