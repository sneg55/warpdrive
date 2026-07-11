import { redirect } from "next/navigation";
import { STRINGS } from "@/constants/strings";
import { db } from "@/db/client";
import { parseFolder } from "@/features/email/inboxFolders";
import { getActorMailbox } from "@/features/email/mailboxOwnership";
import { createContext } from "@/server/trpc/context";
import { InboxListClient } from "./InboxListClient";

export const metadata = { title: STRINGS.inbox.title };

export default async function InboxPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<React.ReactNode> {
  const ctx = await createContext();
  if (ctx.actor === null) {
    redirect("/login");
  }
  const sp = await searchParams;
  const folder = parseFolder(typeof sp.folder === "string" ? sp.folder : undefined);
  const mailbox = await getActorMailbox(db, ctx.actor.id, AbortSignal.timeout(8000));
  return <InboxListClient selfActorId={ctx.actor.id} folder={folder} mailbox={mailbox} />;
}
