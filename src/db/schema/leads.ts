import { sql } from "drizzle-orm";
import {
  customType,
  date,
  index,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { deals } from "./deals";
import { users, visibilityGroups, visibilityLevelEnum } from "./identity";

const tsvector = customType<{ data: string }>({
  dataType: () => "tsvector",
});

export const leads = pgTable(
  "leads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    title: text("title").notNull(),
    value: numeric("value", { precision: 14, scale: 2 }),
    personId: uuid("person_id"),
    orgId: uuid("org_id"),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id),
    expectedCloseDate: date("expected_close_date"),
    labels: text("labels").array().notNull().default(sql`'{}'`),
    customFields: jsonb("custom_fields").notNull().default(sql`'{}'::jsonb`),
    sourceChannel: text("source_channel"),
    sourceChannelId: text("source_channel_id"),
    sourceOrigin: text("source_origin").notNull().default("manually_created"),
    visibilityLevel: visibilityLevelEnum("visibility_level").notNull(),
    visibilityGroupId: uuid("visibility_group_id").references(() => visibilityGroups.id),
    visibleToUserIds: uuid("visible_to_user_ids").array().notNull().default(sql`'{}'`),
    lastActivityAt: timestamp("last_activity_at", { withTimezone: true }),
    nextActivityAt: timestamp("next_activity_at", { withTimezone: true }),
    convertedDealId: uuid("converted_deal_id").references(() => deals.id),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    searchTsv: tsvector("search_tsv")
      .notNull()
      .generatedAlwaysAs(sql`to_tsvector('simple', coalesce(title, ''))`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("leads_inbox_idx").on(t.archivedAt, t.createdAt).where(sql`deleted_at is null`),
    index("leads_owner_idx").on(t.ownerId),
    index("leads_visible_to_gin").using("gin", t.visibleToUserIds),
    index("leads_visibility_group_idx")
      .on(t.visibilityGroupId)
      .where(sql`visibility_level = 'group'`),
    index("leads_search_idx").using("gin", t.searchTsv),
    index("leads_cf_idx").using("gin", t.customFields),
  ],
);

export type Lead = typeof leads.$inferSelect;
export type NewLead = typeof leads.$inferInsert;
