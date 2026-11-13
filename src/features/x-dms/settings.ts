import { type Env, env } from "@/config/env";

export interface XDmSettings {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export function xDmSettings(
  source: Pick<Env, "X_CLIENT_ID" | "X_CLIENT_SECRET" | "BASE_URL"> = env,
): XDmSettings | null {
  const clientId = source.X_CLIENT_ID.trim();
  const clientSecret = source.X_CLIENT_SECRET.trim();
  if (clientId === "" || clientSecret === "") return null;
  return { clientId, clientSecret, redirectUri: `${source.BASE_URL}/api/x/oauth/callback` };
}

export function isXDmsEnabled(): boolean {
  return xDmSettings() !== null;
}
