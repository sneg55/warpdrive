import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { env } from "@/config/env";
import { db } from "@/db/client";
import { CSRF_COOKIE } from "@/features/auth/csrf";
import { loadLiveSession, SESSION_COOKIE } from "@/features/auth/session";
import { authorizationRequestInput, authorizationSearchParams } from "@/features/oauth/authorize";
import { getClient } from "@/features/oauth/clients";
import { Consent } from "../consent";

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function OAuthConsentPage({
  searchParams,
}: PageProps): Promise<React.ReactNode> {
  if (!env.MCP_ENABLED) notFound();
  const parsed = authorizationRequestInput.safeParse(await searchParams);
  if (!parsed.success) notFound();

  const signal = AbortSignal.timeout(5_000);
  const client = await getClient(db, parsed.data.client_id, signal);
  if (client === undefined || !client.redirectUris.includes(parsed.data.redirect_uri)) notFound();

  const jar = await cookies();
  const sid = jar.get(SESSION_COOKIE)?.value;
  const csrfToken = jar.get(CSRF_COOKIE)?.value;
  const session = sid === undefined ? null : await loadLiveSession(db, sid, signal);
  if (session === null || !session.ok || csrfToken === undefined) {
    redirect(`/oauth/authorize?${authorizationSearchParams(parsed.data).toString()}`);
  }

  const action = new URL("/oauth/authorize", env.BASE_URL);
  action.search = authorizationSearchParams(parsed.data).toString();
  action.searchParams.set("csrf_token", csrfToken);
  return <Consent action={`${action.pathname}${action.search}`} clientName={client.name} />;
}
