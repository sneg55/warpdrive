import { readCsrfToken } from "@/utils/csrfCookie";
import { connectTeamMailboxStart } from "./teamMailboxActions";

export async function redirectToTeamMailboxConsent(input: {
  backfillDays: number;
  loginHint?: string;
}): Promise<string | null> {
  const result = await connectTeamMailboxStart(input, readCsrfToken());
  if (!result.ok) return result.error.id;
  window.location.assign(result.value.url);
  return null;
}
