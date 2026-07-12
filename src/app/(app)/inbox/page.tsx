import { redirect } from "next/navigation";
import { STRINGS } from "@/constants/strings";
import { parseFolder } from "@/features/email/inboxFolders";
import { createContext } from "@/server/trpc/context";
import { InboxListClient } from "./InboxListClient";

export const metadata = { title: STRINGS.inbox.title };

// Mailbox presence (for the rail's New email button) is read once in the shared inbox layout, not
// here, so this route only resolves the active folder for the conversation column.
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
  return <InboxListClient selfActorId={ctx.actor.id} folder={folder} />;
}
