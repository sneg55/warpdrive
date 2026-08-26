import { type SQL, sql } from "drizzle-orm";
import {
  check,
  customType,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { users, visibilityGroups, visibilityLevelEnum } from "./identity";

// tsvector custom type for the generated search column (same pattern as deals.ts).
const tsvector = customType<{ data: string }>({
  dataType: () => "tsvector",
});

// Reduces a stored domain to a bare host so "https://www.acme.com/" and "acme.com" are the same
// token. Every function here is IMMUTABLE, which is what lets search_tsv be a generated column.
// The TypeScript counterpart is normaliseDomain in src/features/enrichment/domain.ts.
export function normalisedDomainSql(col: SQL): SQL {
  return sql`split_part(regexp_replace(lower(${col}), '^(https?://)?(www\\.)?', ''), '/', 1)`;
}

const GENERATED_DOMAIN = normalisedDomainSql(sql`coalesce(domain, '')`);

export const organizations = pgTable(
  "organizations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    // Structured postal/mailing address stored as JSONB (data-model section 6).
    address: jsonb("address").$type<Record<string, unknown> | null>(),
    // Firmographics (Wave 3 decision B3): website/domain, industry, headcount, revenue, and
    // LinkedIn, all nullable/optional. Editable via the org detail Details panel.
    domain: text("domain"),
    industry: text("industry"),
    employeeCount: integer("employee_count"),
    annualRevenue: numeric("annual_revenue", { precision: 14, scale: 2 }),
    linkedinUrl: text("linkedin_url"),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id),
    visibilityLevel: visibilityLevelEnum("visibility_level").notNull(),
    visibilityGroupId: uuid("visibility_group_id").references(() => visibilityGroups.id),
    // Additive per-user ALLOW list; GIN-indexed.
    visibleToUserIds: uuid("visible_to_user_ids").array().notNull().default(sql`'{}'`),
    // Label keys (Pipedrive "Add labels" on the org header); resolved to name+color in the UI.
    labels: text("labels").array().notNull().default(sql`'{}'`),
    customFields: jsonb("custom_fields").notNull().default(sql`'{}'::jsonb`),
    // Generated tsvector column for full-text search. The domain is normalised before indexing and
    // weighted below the name, so a name hit still outranks an org that merely shares a domain.
    searchTsv: tsvector("search_tsv")
      .notNull()
      .generatedAlwaysAs(
        sql`setweight(to_tsvector('simple', coalesce(name, '')), 'A') || setweight(to_tsvector('simple', ${GENERATED_DOMAIN}), 'B')`,
      ),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    // CHECK: group-level records must name their group.
    check(
      "org_group_required",
      sql`visibility_level <> 'group' OR visibility_group_id IS NOT NULL`,
    ),
    // Index: FK lookups by owner.
    index("org_owner_idx").on(t.ownerId),
    // GIN: custom-field filters.
    index("org_cf_idx").using("gin", t.customFields),
    // GIN: full-text search.
    index("org_search_idx").using("gin", t.searchTsv),
    // GIN: canSee allowlist predicate.
    index("org_visible_idx").using("gin", t.visibleToUserIds),
    // Partial: group-visibility rows only.
    index("org_group_idx").on(t.visibilityGroupId).where(sql`visibility_level = 'group'`),
  ],
);

export type Organization = typeof organizations.$inferSelect;
export type NewOrganization = typeof organizations.$inferInsert;
