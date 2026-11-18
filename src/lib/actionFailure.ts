import { unstable_isUnrecognizedActionError } from "next/navigation";
import { ERROR_IDS } from "@/constants/errorIds";
import type { ClientError } from "@/types/actionResult";

export interface ActionFailure {
  ok: false;
  error: ClientError;
}

export interface ActionFailureCopy {
  failed: string;
  retry: string;
  unconfirmed: string;
  check: string;
}

export async function settleAction<R>(call: () => Promise<R>): Promise<R | ActionFailure> {
  try {
    return await call();
  } catch (e) {
    if (unstable_isUnrecognizedActionError(e)) {
      return { ok: false, error: { id: ERROR_IDS.UI_STALE_BUILD } };
    }
    console.warn("action rejected without returning a Result", e);
    return { ok: false, error: { id: ERROR_IDS.UI_ACTION_UNCONFIRMED } };
  }
}

export function actionFailureMessage(copy: ActionFailureCopy, errorId: string): string {
  if (errorId === ERROR_IDS.UI_STALE_BUILD) {
    return `Warpdrive was updated while this page was open. Reload the page, then ${copy.retry} again. (${errorId})`;
  }
  if (errorId === ERROR_IDS.UI_ACTION_UNCONFIRMED) {
    return `We could not confirm ${copy.unconfirmed}. ${copy.check} (${errorId})`;
  }
  return `${copy.failed} (${errorId})`;
}
