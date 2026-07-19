import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { ActionErrorProvider } from "@/components/shell/ActionErrorProvider";
import { CsrfRefresher } from "@/components/shell/CsrfRefresher";
import { LeftNav } from "@/components/shell/LeftNav";
import { ReconnectBanner } from "@/components/shell/ReconnectBanner";
import { TopBar } from "@/components/shell/TopBar";
import { db } from "@/db/client";
import { CSRF_COOKIE } from "@/features/auth/csrf";
import { InterfacePrefsProvider } from "@/features/identity/InterfacePrefsProvider";
import { interfacePrefsFromUi } from "@/features/identity/interfacePrefs";
import { getPreferencesForActor } from "@/features/identity/preferencesForActor";
import { VersionBanner } from "@/features/release/ui/VersionBanner";
import { CommandPalette } from "@/features/search/ui/CommandPalette";
import { createContext } from "@/server/trpc/context";

export default async function AppLayout({ children }: { children: ReactNode }): Promise<ReactNode> {
  const ctx = await createContext();
  if (ctx.actor === null) redirect("/login");
  const jar = await cookies();
  const hasCsrf = jar.get(CSRF_COOKIE) !== undefined;
  // The avatar name + photo now ride along on the hydrated actor (createContext already read the
  // user row), so the shell no longer re-reads that row per authenticated page. Only the per-user
  // interface preferences remain; default comfortable when no row exists (DealCard/Board read the
  // density via the data-density attribute).
  const prefs = await getPreferencesForActor(db, ctx.actor.id);
  return (
    <ActionErrorProvider>
      <InterfacePrefsProvider value={interfacePrefsFromUi(prefs.ui)}>
        <div data-density={prefs.density} className="flex h-screen flex-col">
          <CsrfRefresher hasCsrf={hasCsrf} />
          {ctx.actor.type === "admin" && <VersionBanner />}
          <ReconnectBanner />
          <TopBar userId={ctx.actor.id} userName={ctx.actor.name} avatarUrl={ctx.actor.avatarUrl} />
          <div className="flex min-h-0 flex-1">
            <LeftNav />
            <main className="min-w-0 flex-1 overflow-auto bg-muted/70 p-6">{children}</main>
          </div>
          <CommandPalette />
        </div>
      </InterfacePrefsProvider>
    </ActionErrorProvider>
  );
}
