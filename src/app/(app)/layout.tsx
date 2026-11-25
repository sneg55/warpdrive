import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { ActionErrorProvider } from "@/components/shell/ActionErrorProvider";
import { CsrfRefresher } from "@/components/shell/CsrfRefresher";
import { LeftNav } from "@/components/shell/LeftNav";
import { ReconnectBanner } from "@/components/shell/ReconnectBanner";
import { TopBar } from "@/components/shell/TopBar";
import { Toaster } from "@/components/ui/sonner";
import { env } from "@/config/env";
import { NAV_PREF_COOKIE } from "@/constants/cookies";
import { db } from "@/db/client";
import { FollowUpPromptProvider } from "@/features/activities/followUpAfterDone";
import { CSRF_COOKIE } from "@/features/auth/csrf";
import { BrevoEnabledProvider } from "@/features/brevo/BrevoEnabledProvider";
import { isBrevoEnabled } from "@/features/brevo/settings";
import { InboxNavBadge } from "@/features/email/InboxNavBadge";
import { InterfacePrefsProvider } from "@/features/identity/InterfacePrefsProvider";
import { interfacePrefsFromUi } from "@/features/identity/interfacePrefs";
import { getPreferencesForActor } from "@/features/identity/preferencesForActor";
import { IntercomEnabledProvider } from "@/features/intercom/IntercomEnabledProvider";
import { isIntercomEnabled } from "@/features/intercom/settings";
import { IdentifyUser } from "@/features/observability/IdentifyUser";
import { RealtimeUrlProvider } from "@/features/realtime/RealtimeUrlProvider";
import { VersionBanner } from "@/features/release/ui/VersionBanner";
import { CommandPalette } from "@/features/search/ui/CommandPalette";
import { BaseCurrencyProvider } from "@/features/settings/BaseCurrencyProvider";
import { readBaseCurrency } from "@/features/settings/readBaseCurrency";
import { GlobalShortcuts } from "@/features/shortcuts/GlobalShortcuts";
import { appearanceSeedScript, parseAppearance } from "@/features/theme/appearance";
import { createContext } from "@/server/trpc/context";

export default async function AppLayout({ children }: { children: ReactNode }): Promise<ReactNode> {
  const ctx = await createContext();
  if (ctx.actor === null) redirect("/login");
  const jar = await cookies();
  const hasCsrf = jar.get(CSRF_COOKIE) !== undefined;
  const navExpanded = jar.get(NAV_PREF_COOKIE)?.value === "1";
  const [prefs, baseCurrency] = await Promise.all([
    getPreferencesForActor(db, ctx.actor.id),
    readBaseCurrency(db, AbortSignal.timeout(8000)),
  ]);
  return (
    <ActionErrorProvider>
      <IdentifyUser
        user={{
          id: ctx.actor.id,
          name: ctx.actor.name,
          email: ctx.actor.email,
          role: ctx.actor.type,
        }}
      />
      <script
        // biome-ignore lint/security/noDangerouslySetInnerHtml: three known literals; must be inline to beat first paint
        dangerouslySetInnerHTML={{
          __html: appearanceSeedScript(parseAppearance(prefs.ui.appearance)),
        }}
      />
      <RealtimeUrlProvider url={env.NEXT_PUBLIC_WS_URL}>
        <InterfacePrefsProvider value={interfacePrefsFromUi(prefs.ui)}>
          <IntercomEnabledProvider enabled={isIntercomEnabled()}>
            <BrevoEnabledProvider enabled={isBrevoEnabled()}>
              <BaseCurrencyProvider currency={baseCurrency}>
                <FollowUpPromptProvider>
                  <div data-density={prefs.density} className="flex h-screen flex-col">
                    <CsrfRefresher hasCsrf={hasCsrf} />
                    {ctx.actor.type === "admin" && <VersionBanner />}
                    <ReconnectBanner />
                    <TopBar
                      userId={ctx.actor.id}
                      userName={ctx.actor.name}
                      avatarUrl={ctx.actor.avatarUrl}
                      appearance={parseAppearance(prefs.ui.appearance)}
                    />
                    <div className="flex min-h-0 flex-1">
                      <LeftNav
                        initialExpanded={navExpanded}
                        inboxBadge={<InboxNavBadge selfActorId={ctx.actor.id} />}
                      />
                      <main className="min-w-0 flex-1 overflow-auto bg-muted/70 p-6">
                        {children}
                      </main>
                    </div>
                    <CommandPalette />
                    <GlobalShortcuts />
                    <Toaster />
                  </div>
                </FollowUpPromptProvider>
              </BaseCurrencyProvider>
            </BrevoEnabledProvider>
          </IntercomEnabledProvider>
        </InterfacePrefsProvider>
      </RealtimeUrlProvider>
    </ActionErrorProvider>
  );
}
