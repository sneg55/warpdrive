import { TRPCError } from "@trpc/server";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { STRINGS } from "@/constants/strings";
import type { XConversationDetail } from "@/features/x-dms/reads";
import { parseXListView } from "@/features/x-dms/ui/xRoutes";
import { createContext } from "@/server/trpc/context";
import { createCaller } from "@/server/trpc/root";
import { XConversationClient } from "./XConversationClient";

export const metadata = { title: STRINGS.inbox.title };

const routeParams = z.object({ accountId: z.uuid(), conversationId: z.uuid() });

async function loadConversation(
  load: () => Promise<XConversationDetail>,
): Promise<XConversationDetail | null> {
  try {
    return await load();
  } catch (e) {
    if (e instanceof TRPCError && e.code === "NOT_FOUND") return null;
    throw e;
  }
}

export default async function XConversationPage({
  params,
  searchParams,
}: {
  params: Promise<{ accountId: string; conversationId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<React.ReactNode> {
  const ctx = await createContext();
  if (ctx.actor === null) redirect("/login");
  const parsed = routeParams.safeParse(await params);
  if (!parsed.success) notFound();
  const { accountId, conversationId } = parsed.data;
  const caller = createCaller(ctx);
  const detail = await loadConversation(() => caller.xDms.conversation({ conversationId }));
  if (detail === null || detail.conversation.accountId !== accountId) notFound();
  return (
    <XConversationClient
      selfActorId={ctx.actor.id}
      accountId={accountId}
      conversationId={conversationId}
      view={parseXListView((await searchParams).view)}
      initialData={detail}
    />
  );
}
