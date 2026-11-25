import { type Env, env } from "@/config/env";
import { BREVO_BASE_URL } from "@/constants/brevo";

export interface BrevoSettings {
  apiKey: string;
  baseUrl: string;
}

export function brevoSettings(source: Pick<Env, "BREVO_API_KEY"> = env): BrevoSettings | null {
  const apiKey = source.BREVO_API_KEY.trim();
  if (apiKey === "") return null;
  return { apiKey, baseUrl: BREVO_BASE_URL };
}

export function isBrevoEnabled(): boolean {
  return brevoSettings() !== null;
}
