import { type Env, env } from "@/config/env";
import { INTERCOM_REGION_HOSTS } from "@/constants/intercom";

export interface IntercomSettings {
  token: string;
  baseUrl: string;
}

export function intercomSettings(
  source: Pick<Env, "INTERCOM_ACCESS_TOKEN" | "INTERCOM_REGION"> = env,
): IntercomSettings | null {
  const token = source.INTERCOM_ACCESS_TOKEN.trim();
  if (token === "") return null;
  return { token, baseUrl: INTERCOM_REGION_HOSTS[source.INTERCOM_REGION] };
}

export function isIntercomEnabled(): boolean {
  return intercomSettings() !== null;
}
