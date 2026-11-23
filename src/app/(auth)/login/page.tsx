import type React from "react";
import { STRINGS } from "@/constants/strings";
import { enabledSigninProviders } from "@/features/auth/enabledProviders";

const BUTTON =
  "inline-flex w-full items-center justify-center rounded-md bg-action px-4 py-2 text-sm text-action-foreground transition-transform active:scale-[0.96]";

export default function LoginPage(): React.ReactNode {
  const providers = enabledSigninProviders();
  const both = providers.google && providers.oidc;

  return (
    <main className="flex h-screen items-center justify-center">
      <div className="w-80 space-y-4 rounded-lg border p-6 text-center">
        <h1 className="text-balance text-xl font-semibold">{STRINGS.auth.loginTitle}</h1>
        {both ? (
          <p className="text-pretty text-sm text-muted-foreground">{STRINGS.auth.anyAccount}</p>
        ) : (
          providers.google && (
            <p className="text-pretty text-sm text-muted-foreground">{STRINGS.auth.domainOnly}</p>
          )
        )}
        {providers.google && (
          <a href="/auth/start/google" className={BUTTON}>
            {STRINGS.auth.signInWithGoogle}
          </a>
        )}
        {providers.oidc && (
          <a href="/auth/start/oidc" className={BUTTON}>
            {STRINGS.auth.signInWithSso}
          </a>
        )}
      </div>
    </main>
  );
}
