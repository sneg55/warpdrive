import { sql } from "drizzle-orm";
import {
  check,
  customType,
  date,
  foreignKey,
  index,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { DEAL_STATUS } from "@/constants/dealStatus";
import { users, visibilityGroups, visibilityLevelEnum } from "./identity";
import { lostReasons } from "./lostReasons";
import { pipelines } from "./pipelines";
import { stages } from "./stages";

const tsvector = customType<{ data: string }>({
  dataType: () => "tsvector",
});

export const dealStatus = pgEnum("deal_status", DEAL_STATUS);

export const deals = pgTable(
  "deals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    title: text("title").notNull(),
    status: dealStatus("status").notNull().default("open"),
    value: numeric("value", { precision: 14, scale: 2 }),
    expectedCloseDate: date("expected_close_date"),
    labels: text("labels").array().notNull().default(sql`'{}'`),
    sourceChannel: text("source_channel"),
    sourceChannelId: text("source_channel_id"),
    lostReason: text("lost_reason"),
    lostReasonId: uuid("lost_reason_id").references(() => lostReasons.id),
    wonTime: timestamp("won_time", { withTimezone: true }),
    lostTime: timestamp("lost_time", { withTimezone: true }),
    pipelineId: uuid("pipeline_id")
      .notNull()
      .references(() => pipelines.id),
    stageId: uuid("stage_id").notNull(),
    boardPosition: numeric("board_position").notNull().default("0"),
    personId: uuid("person_id"),
    orgId: uuid("org_id"),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id),
    visibilityLevel: visibilityLevelEnum("visibility_level").notNull(),
    visibilityGroupId: uuid("visibility_group_id").references(() => visibilityGroups.id),
    visibleToUserIds: uuid("visible_to_user_ids").array().notNull().default(sql`'{}'`),
    lastActivityAt: timestamp("last_activity_at", { withTimezone: true }),
    nextActivityAt: timestamp("next_activity_at", { withTimezone: true }),
    stageEnteredAt: timestamp("stage_entered_at", { withTimezone: true }).notNull().defaultNow(),
    customFields: jsonb("custom_fields").notNull().default(sql`'{}'::jsonb`),
    searchTsv: tsvector("search_tsv")
      .notNull()
      .generatedAlwaysAs(sql`to_tsvector('simple', coalesce(title, ''))`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (t) => [
    foreignKey({
      columns: [t.stageId, t.pipelineId],
      foreignColumns: [stages.id, stages.pipelineId],
      name: "deals_stage_pipeline_fk",
    }),
    check("deals_group_ck", sql`visibility_level <> 'group' OR visibility_group_id IS NOT NULL`),
    index("deals_board_col_idx")
      .on(t.pipelineId, t.stageId, t.status)
      .where(sql`deleted_at is null`),
    index("deals_stage_pos_idx").on(t.stageId, t.boardPosition),
    index("deals_archived_idx").on(t.archivedAt).where(sql`deleted_at is null`),
    index("deals_owner_idx").on(t.ownerId),
    index("deals_person_idx").on(t.personId),
    index("deals_org_idx").on(t.orgId),
    index("deals_pipeline_idx").on(t.pipelineId),
    index("deals_next_activity_idx").on(t.nextActivityAt),
    index("deals_close_date_idx").on(t.expectedCloseDate),
    index("deals_visible_to_gin").using("gin", t.visibleToUserIds),
    index("deals_visibility_group_idx")
      .on(t.visibilityGroupId)
      .where(sql`visibility_level = 'group'`),
    index("deals_custom_fields_gin").using("gin", t.customFields),
    index("deals_search_gin").using("gin", t.searchTsv),
  ],
);

export type Deal = typeof deals.$inferSelect;
export type NewDeal = typeof deals.$inferInsert;
