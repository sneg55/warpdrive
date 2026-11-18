import { redirect } from "next/navigation";
import type React from "react";
import { db } from "@/db/client";
import { listActorMailboxes } from "@/features/email/actorMailboxes";
import { createContext } from "@/server/trpc/context";
import { InboxShell } from "./InboxShell";

export default async function InboxLayout({
  children,
}: {
  children: React.ReactNode;
}): Promise<React.ReactNode> {
  const ctx = await createContext();
  if (ctx.actor === null) {
    redirect("/login");
  }
  const mailbox = await listActorMailboxes(db, ctx.actor.id, AbortSignal.timeout(8000));
  return (
    <InboxShell newEmailEnabled={mailbox.some((choice) => choice.status === "connected")}>
      {children}
    </InboxShell>
  );
}
