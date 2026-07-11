import { ERROR_IDS } from "@/constants/errorIds";

// Domain-neutral user-facing copy for a failed action (any feature: settings, leads, email,
// contacts) that would otherwise fail silently. Keyed by AppError id (src/constants/errorIds.ts);
// an unmapped id or a rejected promise with no id falls back to the generic entry. The
// deal-workspace has its own richer, deal-specific mapper (dealActionError.ts); this one is the
// app-wide default surfaced by ActionErrorProvider.
export interface ActionErrorContent {
  title: string;
  body: string;
}

const GENERIC: ActionErrorContent = {
  title: "Couldn't complete that action",
  body: "Something went wrong and your change wasn't saved. Please refresh and try again.",
};

const CONTENT: Record<string, ActionErrorContent> = {
  [ERROR_IDS.PERM_DENIED]: {
    title: "You don't have permission",
    body: "You're not allowed to make this change. Ask an admin if you think this is a mistake.",
  },
  [ERROR_IDS.AUTH_SESSION_DEAD]: {
    title: "Your session expired",
    body: "Please sign in again to continue.",
  },
  E_AUTH_CSRF: {
    title: "Your session expired",
    body: "Please refresh the page and try again.",
  },
};

export function actionErrorContent(errorId?: string): ActionErrorContent {
  if (errorId === undefined) return GENERIC;
  return CONTENT[errorId] ?? GENERIC;
}
