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

const tsvector = customType<{ data: string }>({
  dataType: () => "tsvector",
});

const citext = customType<{ data: string }>({
  dataType: () => "citext",
});

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
    primaryEmail: citext("primary_email"),
    emails: jsonb("emails").$type<ContactPoint[]>().notNull().default(sql`'[]'::jsonb`),
    phones: jsonb("phones").$type<ContactPoint[]>().notNull().default(sql`'[]'::jsonb`),
    orgId: uuid("org_id").references(() => organizations.id),
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
    check(
      "person_group_required",
      sql`visibility_level <> 'group' OR visibility_group_id IS NOT NULL`,
    ),
    index("person_email_idx").on(t.primaryEmail),
    index("person_org_idx").on(t.orgId),
    index("person_owner_idx").on(t.ownerId),
    index("person_cf_idx").using("gin", t.customFields),
    index("person_search_idx").using("gin", t.searchTsv),
    index("person_visible_idx").using("gin", t.visibleToUserIds),
    index("person_group_idx").on(t.visibilityGroupId).where(sql`visibility_level = 'group'`),
  ],
);

export type Person = typeof persons.$inferSelect;
export type NewPerson = typeof persons.$inferInsert;
