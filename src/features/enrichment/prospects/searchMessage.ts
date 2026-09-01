import { ENRICHMENT_STRINGS } from "@/constants/enrichmentStrings";
import { ERROR_IDS } from "@/constants/errorIds";
import { PROSPECT_SELECTION_MAX } from "@/constants/prospectSearch";
import type { ProviderOutcome } from "../providers/types";

const S = ENRICHMENT_STRINGS.prospects;
const NAMES = ENRICHMENT_STRINGS.settings.providerNames;

export interface SearchMessage {
  title: string;
  body: string;
}

export function messageForErrorId(errorId: string, orgName: string): SearchMessage {
  if (errorId === ERROR_IDS.ENRICH_ORG_NO_DOMAIN) {
    return { title: S.noDomainTitle, body: S.noDomainBody };
  }
  if (errorId === ERROR_IDS.ENRICH_NO_SEARCH_PROVIDER) {
    return { title: S.noProviderTitle, body: S.noProviderBody };
  }
  return { title: S.emptyTitle(orgName), body: ENRICHMENT_STRINGS.dialog.runError };
}

function withDetail(body: string, detail: string | undefined): string {
  return detail === undefined || detail.length === 0 ? body : `${body} (${detail})`;
}

export function messageForOutcome(outcome: ProviderOutcome, orgName: string): SearchMessage | null {
  const { kind, provider } = outcome;
  if (kind === "ok") return null;
  if (kind === "no_match") return { title: S.emptyTitle(orgName), body: S.emptyBody };
  if (kind === "not_entitled") {
    return { title: S.noProviderTitle, body: S.notEntitled(NAMES[provider]) };
  }
  if (kind === "throttled" || kind === "quota") {
    return { title: S.noProviderTitle, body: ENRICHMENT_STRINGS.dialog.throttledErrorUnknown };
  }
  if (kind === "auth" || kind === "key_unreadable") {
    return { title: S.noProviderTitle, body: ENRICHMENT_STRINGS.dialog.keyUnreadableError };
  }
  return {
    title: S.emptyTitle(orgName),
    body: withDetail(ENRICHMENT_STRINGS.dialog.runError, outcome.message),
  };
}

export function revealErrorMessage(errorId: string): string {
  if (errorId === ERROR_IDS.ENRICH_SELECTION_TOO_LARGE) {
    return S.selectionFull(PROSPECT_SELECTION_MAX);
  }
  if (errorId === ERROR_IDS.PERM_DENIED) return S.itemDenied;
  if (errorId === ERROR_IDS.ENRICH_NO_PROVIDER) return S.noProviderBody;
  if (errorId === ERROR_IDS.ENRICH_THROTTLED) {
    return ENRICHMENT_STRINGS.dialog.throttledErrorUnknown;
  }
  return S.revealFailed;
}
