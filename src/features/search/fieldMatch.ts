import { type SQL, sql } from "drizzle-orm";
import type { SearchSection } from "@/constants/search";
import { normalisedDomainSql } from "@/db/schema/organizations";
import { assertNever } from "@/types/result";
import { orgDomainTerm } from "./domainTerm";
import { matchesEveryTermInAnyOf, type SearchPattern } from "./pattern";

export function fieldMatchSql(section: SearchSection, p: SearchPattern, rawQuery: string): SQL {
  switch (section) {
    case "deal":
    case "lead":
      return matchesEveryTermInAnyOf([sql`r.title`], p);
    case "person":
      return matchesEveryTermInAnyOf([sql`r.name`, sql`r.primary_email::text`], p);
    case "organization": {
      const stored = normalisedDomainSql(sql`coalesce(r.domain, '')`);
      const term = orgDomainTerm(rawQuery);
      const byTerms = matchesEveryTermInAnyOf([sql`r.name`, stored], p);
      return term === null ? byTerms : sql`(${byTerms} OR ${stored} = ${term})`;
    }
    default:
      return assertNever(section);
  }
}
