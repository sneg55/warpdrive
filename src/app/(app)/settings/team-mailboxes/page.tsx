import { TeamMailboxSettings } from "@/features/email/TeamMailboxSettings";
import { listTeamMailboxSettings } from "@/features/email/teamMailboxAdmin";
import { listAssignableUsers } from "@/features/identity/users.service";
import { listXAccountsForAdmin } from "@/features/x-dms/accountAdmin";
import { isXDmsEnabled } from "@/features/x-dms/settings";
import { XAccountsCard } from "@/features/x-dms/ui/XAccountsCard";
import { createContext } from "@/server/trpc/context";
import { SettingsHeading } from "../SettingsHeading";
import { SettingsPage } from "../SettingsSurface";

export const metadata = { title: "Team mailboxes" };

export default async function TeamMailboxesPage({
  searchParams,
}: {
  searchParams: Promise<{ x?: string }>;
}): Promise<React.ReactNode> {
  const { x } = await searchParams;
  const ctx = await createContext();
  if (ctx.actor?.type !== "admin") return <p>Administrator access required.</p>;
  const signal = new AbortController().signal;
  const xEnabled = isXDmsEnabled();
  const [mailboxes, users, xAccounts] = await Promise.all([
    listTeamMailboxSettings(ctx.db, ctx.actor.id, signal),
    listAssignableUsers(ctx.db, signal),
    xEnabled ? listXAccountsForAdmin(ctx.db, ctx.actor.id, signal) : Promise.resolve(null),
  ]);
  signal.throwIfAborted();
  if (!mailboxes.ok) return <p role="alert">{mailboxes.error.id}</p>;
  if (xAccounts !== null && !xAccounts.ok) return <p role="alert">{xAccounts.error.id}</p>;
  const assignable = users.map((user) => ({ id: user.id, name: user.name }));
  return (
    <SettingsPage>
      <SettingsHeading
        title="Team mailboxes"
        description="Connect a Workspace mailbox and choose who can work its conversations."
      />
      {x === "ok" && <p role="status">X account connected.</p>}
      {x === "error" && <p role="alert">Connecting the X account failed. Try again.</p>}
      <TeamMailboxSettings mailboxes={mailboxes.value} users={assignable} />
      <XAccountsCard
        enabled={xEnabled}
        accounts={xAccounts?.ok === true ? xAccounts.value : []}
        users={assignable}
      />
    </SettingsPage>
  );
}
