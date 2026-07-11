import { ERROR_IDS } from "@/constants/errorIds";

// User-facing copy for a failed deal action (stage change, label edit, inline field save) that
// would otherwise be swallowed silently. Keyed by AppError id (src/constants/errorIds.ts); an
// unlisted id or a rejected promise with no id falls back to the generic entry. Mirrors the
// inline saveError map but returns a title+body pair for a modal instead of one inline line.
export interface DealActionErrorContent {
  title: string;
  body: string;
}

const GENERIC: DealActionErrorContent = {
  title: "Couldn't save your change",
  body: "Something went wrong. Please refresh and try again.",
};

const CONTENT: Record<string, DealActionErrorContent> = {
  [ERROR_IDS.PERM_DENIED]: {
    title: "You don't have permission",
    body: "Only the deal owner (or an admin) can make this change. Ask the owner to update it or to hand over the deal.",
  },
  [ERROR_IDS.DEAL_PRECONDITION]: {
    title: "This deal changed elsewhere",
    body: "This deal changed while you were editing. We've reloaded it, please try your change again.",
  },
  [ERROR_IDS.DEAL_NOT_FOUND]: {
    title: "Deal not available",
    body: "This deal is no longer available to you. It may have been deleted or its visibility changed.",
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

export function dealActionErrorContent(errorId?: string): DealActionErrorContent {
  if (errorId === undefined) return GENERIC;
  return CONTENT[errorId] ?? GENERIC;
}
