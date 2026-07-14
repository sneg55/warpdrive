import type React from "react";
import { STRINGS } from "@/constants/strings";

export default function LoginPage(): React.ReactNode {
  return (
    <main className="flex h-screen items-center justify-center">
      <div className="w-80 space-y-4 rounded-lg border p-6 text-center">
        <h1 className="text-balance text-xl font-semibold">{STRINGS.auth.loginTitle}</h1>
        <p className="text-pretty text-sm text-muted-foreground">{STRINGS.auth.domainOnly}</p>
        <a
          href="/auth/start"
          className="inline-flex w-full items-center justify-center rounded-md bg-action px-4 py-2 text-sm text-action-foreground transition-transform active:scale-[0.96]"
        >
          {STRINGS.auth.signInWithGoogle}
        </a>
      </div>
    </main>
  );
}
