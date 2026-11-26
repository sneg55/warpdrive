import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { STRINGS } from "@/constants/strings";
import { listActorMailboxes } from "@/features/email/actorMailboxes";
import { parseFolder } from "@/features/email/inboxFolders";
import { isMailboxConnected } from "@/features/email/inboxZero";
import { readMailboxSyncPhase } from "@/features/email/mailboxSyncPhase";
import { timed, timingRoute } from "@/features/observability/serverTiming";
import { createContext } from "@/server/trpc/context";
import { InboxListClient } from "./InboxListClient";

export const metadata = { title: STRINGS.inbox.title };

export default async function InboxPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<React.ReactNode> {
  await timingRoute("/inbox");
  const ctx = await createContext();
  if (ctx.actor === null) {
    redirect("/login");
  }
  const sp = await searchParams;
  const rawMailbox = sp.mailbox;
  const parsed = z.uuid().optional().safeParse(rawMailbox);
  if (!parsed.success) notFound();
  const mailbox = parsed.data;
  const actorId = ctx.actor.id;
  const choices = await timed("inbox.mailboxes", () =>
    listActorMailboxes(ctx.db, actorId, new AbortController().signal),
  );
  if (mailbox !== undefined) {
    if (!choices.some((choice) => choice.id === mailbox && choice.kind === "team")) notFound();
  }
  const initialSyncPhase = await timed("inbox.syncPhase", () =>
    readMailboxSyncPhase(ctx.db, { actorId, mailbox }, AbortSignal.timeout(8000)),
  );
  const folder = parseFolder(typeof sp.folder === "string" ? sp.folder : undefined);
  return (
    <InboxListClient
      selfActorId={ctx.actor.id}
      folder={folder}
      mailbox={mailbox}
      mailboxConnected={isMailboxConnected(choices, mailbox)}
      initialSyncPhase={initialSyncPhase}
    />
  );
}
