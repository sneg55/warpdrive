import { atomicCrm } from "./atomicCrm";
import { espocrm } from "./espocrm";
import { frappeCrm } from "./frappeCrm";
import { krayin } from "./krayin";
import { pipedrive } from "./pipedrive";
import { suitecrm } from "./suitecrm";
import { twenty } from "./twenty";
import type { Competitor, CompetitorSlug } from "./types";

export { COMPARISON_AS_OF } from "./types";
export type { Competitor, CompetitorSlug, FaqItem } from "./types";

export const COMPETITORS = {
  pipedrive,
  twenty,
  espocrm,
  krayin,
  "frappe-crm": frappeCrm,
  "atomic-crm": atomicCrm,
  suitecrm,
} as const satisfies Record<CompetitorSlug, Competitor>;
