import { sql } from "drizzle-orm";
import {
  customType,
  date,
  index,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { deals } from "./deals";
import { users, visibilityGroups, visibilityLevelEnum } from "./identity";

// tsvector custom type for the generated search column (mirrors deals.ts: drizzle-orm has no
// first-class tsvector column builder, so a customType keeps the Drizzle model typed).
const tsvector = customType<{ data: string }>({
  dataType: () => "tsvector",
});

// Leads are pre-deal opportunities (Pipedrive's Leads Inbox). They carry the same trust-boundary
// visibility fields as deals but live outside any pipeline/stage; a lead can later convert to a
// deal (convertedDealId records the result). Archiving (archivedAt) moves a lead out of the inbox
// without deleting it; deletedAt is the soft-delete tombstone.
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
    sourceChannel: text("source_channel"),
    sourceChannelId: text("source_channel_id"),
    // Where the lead originated (Pipedrive "source origin"): manually created, import, web form, etc.
    sourceOrigin: text("source_origin").notNull().default("manually_created"),
    // Trust-boundary visibility fields: never accepted from the client.
    visibilityLevel: visibilityLevelEnum("visibility_level").notNull(),
    visibilityGroupId: uuid("visibility_group_id").references(() => visibilityGroups.id),
    visibleToUserIds: uuid("visible_to_user_ids").array().notNull().default(sql`'{}'`),
    lastActivityAt: timestamp("last_activity_at", { withTimezone: true }),
    nextActivityAt: timestamp("next_activity_at", { withTimezone: true }),
    // Set when the lead is converted into a deal (conversion flow is future work).
    convertedDealId: uuid("converted_deal_id").references(() => deals.id),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    // Generated tsvector column for full-text search (mirrors deals.ts).
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
    // Inbox read: active (not archived, not deleted) leads newest first.
    index("leads_inbox_idx").on(t.archivedAt, t.createdAt).where(sql`deleted_at is null`),
    index("leads_owner_idx").on(t.ownerId),
    index("leads_visible_to_gin").using("gin", t.visibleToUserIds),
    index("leads_visibility_group_idx")
      .on(t.visibilityGroupId)
      .where(sql`visibility_level = 'group'`),
    // GIN: full-text search (mirrors deals.ts).
    index("leads_search_idx").using("gin", t.searchTsv),
  ],
);

export type Lead = typeof leads.$inferSelect;
export type NewLead = typeof leads.$inferInsert;
