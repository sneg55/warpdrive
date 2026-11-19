import { type SQL, sql } from "drizzle-orm";
import type { SearchSection } from "@/constants/search";
import type { VisibilityCtx } from "@/features/permissions/sql";
import { dealRecordVisibility, recordVisibility } from "./visibilitySql";

export interface SectionDef {
  section: SearchSection;
  from: SQL;
  base: SQL;
  primary: SQL;
  secondary: SQL;
  visibility: (ctx: VisibilityCtx) => SQL;
}

export const SECTION_DEFS: Record<SearchSection, SectionDef> = {
  deal: {
    section: "deal",
    from: sql`deals r JOIN pipelines p ON p.id = r.pipeline_id`,
    base: sql`r.deleted_at IS NULL AND p.is_archived = false`,
    primary: sql`r.title`,
    secondary: sql`coalesce(r.value::text, '')`,
    visibility: (ctx) => dealRecordVisibility(ctx, "r", "p"),
  },
  person: {
    section: "person",
    from: sql`persons r`,
    base: sql`r.deleted_at IS NULL`,
    primary: sql`r.name`,
    secondary: sql`r.primary_email::text`,
    visibility: (ctx) => recordVisibility(ctx, "r"),
  },
  organization: {
    section: "organization",
    from: sql`organizations r`,
    base: sql`r.deleted_at IS NULL`,
    primary: sql`r.name`,
    secondary: sql`r.domain`,
    visibility: (ctx) => recordVisibility(ctx, "r"),
  },
  lead: {
    section: "lead",
    from: sql`leads r`,
    base: sql`r.deleted_at IS NULL AND r.archived_at IS NULL`,
    primary: sql`r.title`,
    secondary: sql`coalesce(r.value::text, '')`,
    visibility: (ctx) => recordVisibility(ctx, "r"),
  },
};
