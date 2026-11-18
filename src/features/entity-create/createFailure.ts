import { unstable_isUnrecognizedActionError } from "next/navigation";
import { ERROR_IDS } from "@/constants/errorIds";
import type { ClientError } from "@/types/actionResult";

export type CreatedEntityLabel = "deal" | "lead" | "organization" | "person";

export interface CreateFailure {
  ok: false;
  error: ClientError;
}

export async function settleCreate<R>(call: () => Promise<R>): Promise<R | CreateFailure> {
  try {
    return await call();
  } catch (e) {
    if (unstable_isUnrecognizedActionError(e)) {
      return { ok: false, error: { id: ERROR_IDS.UI_STALE_BUILD } };
    }
    console.warn("create action rejected without returning a Result", e);
    return { ok: false, error: { id: ERROR_IDS.UI_ACTION_UNCONFIRMED } };
  }
}

export function createFailureMessage(entity: CreatedEntityLabel, errorId: string): string {
  if (errorId === ERROR_IDS.UI_STALE_BUILD) {
    return `Warpdrive was updated while this page was open. Reload the page, then add the ${entity} again. (${errorId})`;
  }
  if (errorId === ERROR_IDS.UI_ACTION_UNCONFIRMED) {
    return `We could not confirm the ${entity} was created. Check for it before saving again. (${errorId})`;
  }
  return `Could not create ${entity} (${errorId})`;
}
