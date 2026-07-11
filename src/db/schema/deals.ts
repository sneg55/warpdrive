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

// tsvector custom type for the generated search column.
// drizzle-orm 0.45 supports generatedAlwaysAs but does not have a first-class
// tsvector column builder; we use a customType so the Drizzle model stays typed.
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
    // numeric(14,2): money in base currency; null = no value set (data-model §5).
    value: numeric("value", { precision: 14, scale: 2 }),
    expectedCloseDate: date("expected_close_date"),
    // Label keys (Pipedrive multi Hot/Warm/Cold etc.); resolved to name+color in the UI.
    labels: text("labels").array().notNull().default(sql`'{}'`),
    // Where the deal came from (Pipedrive "source channel" + free-form id/reference).
    sourceChannel: text("source_channel"),
    sourceChannelId: text("source_channel_id"),
    lostReason: text("lost_reason"),
    lostReasonId: uuid("lost_reason_id").references(() => lostReasons.id),
    wonTime: timestamp("won_time", { withTimezone: true }),
    lostTime: timestamp("lost_time", { withTimezone: true }),
    pipelineId: uuid("pipeline_id")
      .notNull()
      .references(() => pipelines.id),
    // stage_id participates in the composite FK below (data-model §5).
    stageId: uuid("stage_id").notNull(),
    // Fractional rank for card order within a column (data-model §5).
    boardPosition: numeric("board_position").notNull().default("0"),
    // PHASE 3: person_id / org_id are nullable with NO FK until contacts land.
    personId: uuid("person_id"),
    orgId: uuid("org_id"),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id),
    // visibility_level has no DB default (data-model §5; fail-open forbidden).
    visibilityLevel: visibilityLevelEnum("visibility_level").notNull(),
    visibilityGroupId: uuid("visibility_group_id").references(() => visibilityGroups.id),
    // Additive per-user ALLOW list; GIN-indexed (data-model §14).
    visibleToUserIds: uuid("visible_to_user_ids").array().notNull().default(sql`'{}'`),
    // Denormalized; maintained by app on activity writes.
    lastActivityAt: timestamp("last_activity_at", { withTimezone: true }),
    nextActivityAt: timestamp("next_activity_at", { withTimezone: true }),
    // For time-in-stage + rotting calculation.
    stageEnteredAt: timestamp("stage_entered_at", { withTimezone: true }).notNull().defaultNow(),
    customFields: jsonb("custom_fields").notNull().default(sql`'{}'::jsonb`),
    // Generated tsvector column for full-text search (data-model §15).
    searchTsv: tsvector("search_tsv")
      .notNull()
      .generatedAlwaysAs(sql`to_tsvector('simple', coalesce(title, ''))`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    // Archive is orthogonal to status (deal keeps open/won/lost); null = active.
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (t) => [
    // Composite FK: a deal's stage must belong to the deal's pipeline (data-model §5).
    foreignKey({
      columns: [t.stageId, t.pipelineId],
      foreignColumns: [stages.id, stages.pipelineId],
      name: "deals_stage_pipeline_fk",
    }),
    // CHECK: group-level records must name their group (data-model §5).
    check("deals_group_ck", sql`visibility_level <> 'group' OR visibility_group_id IS NOT NULL`),
    // Index: board column query + sums (data-model §14).
    index("deals_board_col_idx")
      .on(t.pipelineId, t.stageId, t.status)
      .where(sql`deleted_at is null`),
    // Index: ordered card render within a column.
    index("deals_stage_pos_idx").on(t.stageId, t.boardPosition),
    // Active-board reads gate on archived_at IS NULL alongside status/deleted.
    index("deals_archived_idx").on(t.archivedAt).where(sql`deleted_at is null`),
    // Index: FK lookups (data-model §14).
    index("deals_owner_idx").on(t.ownerId),
    index("deals_person_idx").on(t.personId),
    index("deals_org_idx").on(t.orgId),
    index("deals_pipeline_idx").on(t.pipelineId),
    // Index: nudges + forecasting (data-model §14).
    index("deals_next_activity_idx").on(t.nextActivityAt),
    index("deals_close_date_idx").on(t.expectedCloseDate),
    // GIN: canSee allowlist predicate (data-model §14).
    index("deals_visible_to_gin").using("gin", t.visibleToUserIds),
    // GIN: group-visibility predicate where applicable (data-model §14).
    index("deals_visibility_group_idx")
      .on(t.visibilityGroupId)
      .where(sql`visibility_level = 'group'`),
    // GIN: custom-field filters (data-model §14).
    index("deals_custom_fields_gin").using("gin", t.customFields),
    // GIN: full-text search (data-model §14).
    index("deals_search_gin").using("gin", t.searchTsv),
  ],
);

export type Deal = typeof deals.$inferSelect;
export type NewDeal = typeof deals.$inferInsert;
