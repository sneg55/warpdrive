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

const tsvector = customType<{ data: string }>({
  dataType: () => "tsvector",
});

export function normalisedDomainSql(col: SQL): SQL {
  return sql`split_part(regexp_replace(lower(${col}), '^(https?://)?(www\\.)?', ''), '/', 1)`;
}

const GENERATED_DOMAIN = normalisedDomainSql(sql`coalesce(domain, '')`);

export const organizations = pgTable(
  "organizations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    address: jsonb("address").$type<Record<string, unknown> | null>(),
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
    visibleToUserIds: uuid("visible_to_user_ids").array().notNull().default(sql`'{}'`),
    labels: text("labels").array().notNull().default(sql`'{}'`),
    customFields: jsonb("custom_fields").notNull().default(sql`'{}'::jsonb`),
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
    check(
      "org_group_required",
      sql`visibility_level <> 'group' OR visibility_group_id IS NOT NULL`,
    ),
    index("org_owner_idx").on(t.ownerId),
    index("org_cf_idx").using("gin", t.customFields),
    index("org_search_idx").using("gin", t.searchTsv),
    index("org_visible_idx").using("gin", t.visibleToUserIds),
    index("org_group_idx").on(t.visibilityGroupId).where(sql`visibility_level = 'group'`),
  ],
);

export type Organization = typeof organizations.$inferSelect;
export type NewOrganization = typeof organizations.$inferInsert;
