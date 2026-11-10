import { TeamMailboxSettings } from "@/features/email/TeamMailboxSettings";
import { listTeamMailboxSettings } from "@/features/email/teamMailboxAdmin";
import { listAssignableUsers } from "@/features/identity/users.service";
import { createContext } from "@/server/trpc/context";
import { SettingsHeading } from "../SettingsHeading";
import { SettingsPage } from "../SettingsSurface";

export const metadata = { title: "Team mailboxes" };

export default async function TeamMailboxesPage(): Promise<React.ReactNode> {
  const ctx = await createContext();
  if (ctx.actor?.type !== "admin") return <p>Administrator access required.</p>;
  const signal = new AbortController().signal;
  const [mailboxes, users] = await Promise.all([
    listTeamMailboxSettings(ctx.db, ctx.actor.id, signal),
    listAssignableUsers(ctx.db, signal),
  ]);
  signal.throwIfAborted();
  if (!mailboxes.ok) return <p role="alert">{mailboxes.error.id}</p>;
  return (
    <SettingsPage>
      <SettingsHeading
        title="Team mailboxes"
        description="Connect a Workspace mailbox and choose who can work its conversations."
      />
      <TeamMailboxSettings
        mailboxes={mailboxes.value}
        users={users.map((user) => ({ id: user.id, name: user.name }))}
      />
    </SettingsPage>
  );
}
