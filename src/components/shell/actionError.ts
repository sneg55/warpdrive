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
  // Both convert outcomes are states the user can act on, so they never get the generic
  // "refresh and try again" copy: refreshing fixes neither.
  [ERROR_IDS.LEAD_CONVERT_NO_PIPELINE]: {
    title: "No pipeline to convert into",
    body: "Create a pipeline in Settings, then convert this lead again.",
  },
  [ERROR_IDS.LEAD_ALREADY_CONVERTED]: {
    title: "This lead is already converted",
    body: "It already has a deal. Refresh the page to see the current state.",
  },
  // The server rejected the filter's shape, so refreshing changes nothing: the user has to fix a
  // condition before the save can succeed.
  [ERROR_IDS.DEAL_FILTER_INVALID]: {
    title: "One of these conditions isn't valid",
    body: "Check each condition's value: a number field needs a number, and a date field needs a date.",
  },
  [ERROR_IDS.DEAL_BULK_ARCHIVE_PARTIAL]: {
    title: "Some deals weren't archived",
    body: "Deals you can't edit stayed in the list. The rest moved to the Archive tab.",
  },
};

export function actionErrorContent(errorId?: string): ActionErrorContent {
  if (errorId === undefined) return GENERIC;
  return CONTENT[errorId] ?? GENERIC;
}
