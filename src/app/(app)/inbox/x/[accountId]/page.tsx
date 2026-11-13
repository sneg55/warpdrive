import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { STRINGS } from "@/constants/strings";
import { parseXListView } from "@/features/x-dms/ui/xRoutes";
import { createContext } from "@/server/trpc/context";
import { createCaller } from "@/server/trpc/root";
import { XListClient } from "./XListClient";

export const metadata = { title: STRINGS.inbox.title };

export default async function XAccountInboxPage({
  params,
  searchParams,
}: {
  params: Promise<{ accountId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<React.ReactNode> {
  const ctx = await createContext();
  if (ctx.actor === null) redirect("/login");
  const { accountId } = await params;
  if (!z.uuid().safeParse(accountId).success) notFound();
  const accounts = await createCaller(ctx).xDms.accounts();
  const account = accounts.find((a) => a.id === accountId);
  if (account === undefined) notFound();
  const view = parseXListView((await searchParams).view);
  return (
    <XListClient
      selfActorId={ctx.actor.id}
      accountId={account.id}
      accountName={account.displayName}
      view={view}
    />
  );
}
