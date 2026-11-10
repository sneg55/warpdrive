import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { STRINGS } from "@/constants/strings";
import { db } from "@/db/client";
import { listActorMailboxes } from "@/features/email/actorMailboxes";
import { createContext } from "@/server/trpc/context";
import { ComposePageClient } from "./ComposePageClient";

export const metadata = { title: STRINGS.inbox.composeTitle };

export default async function ComposePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<React.ReactNode> {
  const ctx = await createContext();
  if (ctx.actor === null) {
    redirect("/login");
  }
  const sp = await searchParams;
  const selected = z.uuid().optional().safeParse(sp.mailbox);
  if (!selected.success) notFound();
  const mailboxes = (
    await listActorMailboxes(db, ctx.actor.id, new AbortController().signal)
  ).filter((mailbox) => mailbox.status === "connected");
  const mailbox =
    selected.data === undefined
      ? (mailboxes.find((mailbox) => mailbox.kind === "personal") ?? mailboxes[0])
      : mailboxes.find((mailbox) => mailbox.id === selected.data);
  if (mailbox === undefined) {
    if (selected.data !== undefined) notFound();
    redirect("/inbox");
  }
  const draft = typeof sp.draft === "string" ? sp.draft : undefined;
  return (
    <ComposePageClient
      accountId={mailbox.id}
      fromAddress={mailbox.emailAddress}
      selfActorId={ctx.actor.id}
      draftId={draft}
    />
  );
}
