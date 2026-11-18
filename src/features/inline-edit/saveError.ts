import { SAVE_ERROR_MESSAGE } from "./constants";

const MESSAGES: Record<string, string> = {
  E_PERM_001: "You don't have permission to edit this.",
  E_CONTACT_001: "This record is no longer available.",
  E_CONTACT_008: "That value isn't valid.",
  E_AUTH_003: "Your session expired. Please sign in again.",
  E_AUTH_CSRF: "Your session expired. Please refresh and try again.",
};

export function saveErrorMessage(errorId?: string): string {
  if (errorId === undefined) return SAVE_ERROR_MESSAGE;
  return MESSAGES[errorId] ?? SAVE_ERROR_MESSAGE;
}
