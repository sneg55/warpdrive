import { ERROR_IDS } from "@/constants/errorIds";

export const STAGE_EDIT_ERROR_MESSAGE: Record<string, string> = {
  E_STAGE_002: "It still holds deals. Reload the page to see them and choose where to move them.",
  E_STAGE_003: "A pipeline must keep at least one stage.",
  E_STAGE_004: "The stage its deals were going to no longer exists. Reload the page and try again.",
  E_PERM_001: "You do not have permission to edit pipelines.",
  E_AUTH_CSRF: "Your session expired. Reload the page and try again.",
  [ERROR_IDS.UI_ACTION_UNCONFIRMED]:
    "The save did not reach the server, so some changes may not have been applied. Reload the page and try again.",
};

export const STAGE_DELETE_FAILURE_REASON: Record<string, string> = {
  E_STAGE_001: "It was already deleted. Reload the page to see the current stages.",
};
