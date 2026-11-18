import { ERROR_IDS } from "@/constants/errorIds";

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
  [ERROR_IDS.LEAD_CONVERT_NO_PIPELINE]: {
    title: "No pipeline to convert into",
    body: "Create a pipeline in Settings, then convert this lead again.",
  },
  [ERROR_IDS.LEAD_ALREADY_CONVERTED]: {
    title: "This lead is already converted",
    body: "It already has a deal. Refresh the page to see the current state.",
  },
  [ERROR_IDS.UI_STALE_BUILD]: {
    title: "Warpdrive was updated",
    body: "This page is out of date. Reload the page, then try again. (E_UI_002)",
  },
  [ERROR_IDS.UI_ACTION_UNCONFIRMED]: {
    title: "We could not confirm that change",
    body: "The request did not get an answer, so it may not have been saved. Check the record before trying again. (E_UI_003)",
  },
  [ERROR_IDS.DEAL_FILTER_INVALID]: {
    title: "One of these conditions isn't valid",
    body: "Check each condition's value: a number field needs a number, and a date field needs a date.",
  },
  [ERROR_IDS.DEAL_BULK_ARCHIVE_PARTIAL]: {
    title: "Some deals weren't archived",
    body: "Deals you can't edit stayed in the list. The rest moved to the Archive tab.",
  },
  [ERROR_IDS.DEAL_BULK_STAGE_PARTIAL]: {
    title: "Some deals weren't moved",
    body: "Won, lost, and deals you can't edit kept their stage. The rest moved.",
  },
};

export function actionErrorContent(errorId?: string): ActionErrorContent {
  if (errorId === undefined) return GENERIC;
  return CONTENT[errorId] ?? GENERIC;
}
