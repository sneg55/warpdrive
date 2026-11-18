import { ERROR_IDS } from "@/constants/errorIds";
import { actionFailureMessage } from "@/lib/actionFailure";

const MESSAGES: Record<string, string> = {
  [ERROR_IDS.PERM_DENIED]: "You do not have permission to create deals.",
  [ERROR_IDS.LEAD_ALREADY_CONVERTED]: "This lead was already converted.",
  [ERROR_IDS.LEAD_NOT_FOUND]: "This lead changed since it loaded. Refreshing.",
  [ERROR_IDS.LEAD_CONVERT_NO_PIPELINE]: "No target pipeline is configured for convert.",
  [ERROR_IDS.DB_WRITE_FAILED]: `Could not convert this lead. Nothing was changed, try again. (${ERROR_IDS.DB_WRITE_FAILED})`,
};

const LEAD_CONVERT_COPY = {
  failed: "Could not convert this lead.",
  retry: "convert the lead",
  unconfirmed: "the lead was converted",
  check: "Check the lead before converting again.",
};

export function convertErrorMessage(id: string): string {
  if (id === ERROR_IDS.UI_STALE_BUILD || id === ERROR_IDS.UI_ACTION_UNCONFIRMED) {
    return actionFailureMessage(LEAD_CONVERT_COPY, id);
  }
  return MESSAGES[id] ?? LEAD_CONVERT_COPY.failed;
}
