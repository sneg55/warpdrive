import type { XListView } from "../reads";

const viewQuery = (view: XListView): string => (view === "archived" ? "?view=archived" : "");

export function xListHref(accountId: string, view: XListView): string {
  return `/inbox/x/${accountId}${viewQuery(view)}`;
}

export function xConversationHref(
  accountId: string,
  conversationId: string,
  view: XListView,
): string {
  return `/inbox/x/${accountId}/${conversationId}${viewQuery(view)}`;
}

export function parseXListView(raw: string | string[] | undefined): XListView {
  return raw === "archived" ? "archived" : "inbox";
}
