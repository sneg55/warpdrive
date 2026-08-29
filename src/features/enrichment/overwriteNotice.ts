import { ENRICHMENT_STRINGS } from "@/constants/enrichmentStrings";
import { COMPANY_NAME_KEY } from "./canonicalKeys";
import type { ProposedField } from "./types";

const S = ENRICHMENT_STRINGS.dialog;

export function overwriteNotice(field: ProposedField): string | null {
  if (!field.isOverwrite) return null;
  if (field.currentValue === null) return S.overwritesHidden;
  const current = String(field.currentValue);
  return field.canonicalKey === COMPANY_NAME_KEY
    ? S.relinksOrganization(current)
    : S.overwrites(current);
}
