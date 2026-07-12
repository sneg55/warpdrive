import { redirect } from "next/navigation";
import { STRINGS } from "@/constants/strings";
import { db } from "@/db/client";
import { getActorMailbox } from "@/features/email/mailboxOwnership";
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
  // Compose is meaningless without a connected mailbox: send back to the inbox rather than
  // rendering a broken pane.
  const mailbox = await getActorMailbox(db, ctx.actor.id, AbortSignal.timeout(8000));
  if (mailbox === null) {
    redirect("/inbox");
  }
  const sp = await searchParams;
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
