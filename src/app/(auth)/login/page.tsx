import type React from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/Alert";
import { STRINGS } from "@/constants/strings";
import { enabledSigninProviders } from "@/features/auth/enabledProviders";
import { GOOGLE_START_PATH, OIDC_START_PATH, withReturnPath } from "@/features/auth/signinEntry";

const BUTTON =
  "inline-flex w-full items-center justify-center rounded-md bg-action px-4 py-2 text-sm text-action-foreground transition-transform active:scale-[0.96]";

const ERROR_PARAM = "error";

interface LoginPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function hasError(params: Record<string, string | string[] | undefined>): boolean {
  const value = params[ERROR_PARAM];
  if (typeof value === "string") return value.length > 0;
  return Array.isArray(value) && value.length > 0;
}

export default async function LoginPage({
  searchParams,
}: LoginPageProps): Promise<React.ReactNode> {
  const params = await searchParams;
  const failed = hasError(params);
  const returnPath = typeof params.next === "string" ? params.next : null;
  const providers = enabledSigninProviders();
  const both = providers.google && providers.oidc;

  return (
    <main className="flex h-screen items-center justify-center">
      <div className="w-80 space-y-4 rounded-lg border p-6 text-center">
        <h1 className="text-balance text-xl font-semibold">{STRINGS.auth.loginTitle}</h1>
        {failed && (
          <Alert variant="destructive" className="text-left">
            <AlertTitle>{STRINGS.auth.signInFailedTitle}</AlertTitle>
            <AlertDescription>{STRINGS.auth.signInFailedBody}</AlertDescription>
          </Alert>
        )}
        {both ? (
          <p className="text-pretty text-sm text-muted-foreground">{STRINGS.auth.anyAccount}</p>
        ) : (
          providers.google && (
            <p className="text-pretty text-sm text-muted-foreground">{STRINGS.auth.domainOnly}</p>
          )
        )}
        {providers.google && (
          <a href={withReturnPath(GOOGLE_START_PATH, returnPath)} className={BUTTON}>
            {STRINGS.auth.signInWithGoogle}
          </a>
        )}
        {providers.oidc && (
          <a href={withReturnPath(OIDC_START_PATH, returnPath)} className={BUTTON}>
            {STRINGS.auth.signInWithSso}
          </a>
        )}
      </div>
    </main>
  );
}
