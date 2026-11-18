import { STRINGS } from "@/constants/strings";

type LeadsEmptyKind = "none" | "none-archived" | "filtered";

export interface LeadsEmpty {
  kind: LeadsEmptyKind;
  title: string;
  body: string;
  action: string;
}

export function leadsEmptyState({
  archived,
  hasFilter,
}: {
  archived: boolean;
  hasFilter: boolean;
}): LeadsEmpty {
  if (hasFilter) {
    return {
      kind: "filtered",
      title: STRINGS.leads.emptyFilteredTitle,
      body: STRINGS.leads.emptyFilteredBody,
      action: STRINGS.leads.emptyFilteredAction,
    };
  }
  if (archived) {
    return {
      kind: "none-archived",
      title: STRINGS.leads.emptyArchivedTitle,
      body: STRINGS.leads.emptyArchivedBody,
      action: STRINGS.leads.emptyArchivedAction,
    };
  }
  return {
    kind: "none",
    title: STRINGS.leads.emptyTitle,
    body: STRINGS.leads.emptyBody,
    action: STRINGS.leads.emptyAction,
  };
}
