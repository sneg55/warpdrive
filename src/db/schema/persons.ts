import { sql } from "drizzle-orm";
import {
  check,
  customType,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { users, visibilityGroups, visibilityLevelEnum } from "./identity";
import { organizations } from "./organizations";

// tsvector custom type for the generated search column (same pattern as deals.ts).
const tsvector = customType<{ data: string }>({
  dataType: () => "tsvector",
});

// citext for case-insensitive email matching (extension created in migration 0000).
const citext = customType<{ data: string }>({
  dataType: () => "citext",
});

// Typed shape for email/phone contact points stored in JSONB arrays.
type ContactPoint = {
  label: string;
  value: string;
  primary?: boolean;
};

export const persons = pgTable(
  "persons",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    firstName: text("first_name"),
    lastName: text("last_name"),
    // citext: case-insensitive lookup for dedup and search.
    primaryEmail: citext("primary_email"),
    emails: jsonb("emails").$type<ContactPoint[]>().notNull().default(sql`'[]'::jsonb`),
    phones: jsonb("phones").$type<ContactPoint[]>().notNull().default(sql`'[]'::jsonb`),
    orgId: uuid("org_id").references(() => organizations.id),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id),
    visibilityLevel: visibilityLevelEnum("visibility_level").notNull(),
    visibilityGroupId: uuid("visibility_group_id").references(() => visibilityGroups.id),
    // Additive per-user ALLOW list; GIN-indexed.
    visibleToUserIds: uuid("visible_to_user_ids").array().notNull().default(sql`'{}'`),
    // Label keys (Pipedrive "Add labels" on the person header); resolved to name+color in the UI.
    labels: text("labels").array().notNull().default(sql`'{}'`),
    customFields: jsonb("custom_fields").notNull().default(sql`'{}'::jsonb`),
    // Generated tsvector: name (weight A) + primary_email (weight B) for ranked FTS.
    searchTsv: tsvector("search_tsv")
      .notNull()
      .generatedAlwaysAs(
        sql`setweight(to_tsvector('simple', coalesce(name, '')), 'A') || setweight(to_tsvector('simple', coalesce(primary_email::text, '')), 'B')`,
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
      "person_group_required",
      sql`visibility_level <> 'group' OR visibility_group_id IS NOT NULL`,
    ),
    // Index: primary email lookup (also enables citext dedup queries).
    index("person_email_idx").on(t.primaryEmail),
    // Index: FK lookup by org.
    index("person_org_idx").on(t.orgId),
    // Index: FK lookup by owner.
    index("person_owner_idx").on(t.ownerId),
    // GIN: custom-field filters.
    index("person_cf_idx").using("gin", t.customFields),
    // GIN: full-text search.
    index("person_search_idx").using("gin", t.searchTsv),
    // GIN: canSee allowlist predicate.
    index("person_visible_idx").using("gin", t.visibleToUserIds),
    // Partial: group-visibility rows only.
    index("person_group_idx").on(t.visibilityGroupId).where(sql`visibility_level = 'group'`),
  ],
);

export type Person = typeof persons.$inferSelect;
export type NewPerson = typeof persons.$inferInsert;
