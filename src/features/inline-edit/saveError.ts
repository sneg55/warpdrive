import { SAVE_ERROR_MESSAGE } from "./constants";

// Maps the AppError id from a failed inline save to clear, user-facing copy so a denied or expired
// action reads as what it is, not a bare "Couldn't save". Ids come from src/constants/errorIds.ts;
// anything not listed (or a rejected promise with no id) falls back to the generic message.
const MESSAGES: Record<string, string> = {
  E_PERM_001: "You don't have permission to edit this.", // contact.edit / action denied
  E_CONTACT_001: "This record is no longer available.", // not found or no longer visible
  E_CONTACT_008: "That value isn't valid.", // input failed validation
  E_AUTH_003: "Your session expired. Please sign in again.",
  E_AUTH_CSRF: "Your session expired. Please refresh and try again.",
};

export function saveErrorMessage(errorId?: string): string {
  if (errorId === undefined) return SAVE_ERROR_MESSAGE;
  return MESSAGES[errorId] ?? SAVE_ERROR_MESSAGE;
}
