import { redirect } from "next/navigation";
import { STRINGS } from "@/constants/strings";
import { createContext } from "@/server/trpc/context";
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
  return <InboxThreadClient threadId={threadId} selfActorId={ctx.actor.id} />;
}
