import { date, index, numeric, pgEnum, pgTable, timestamp, uuid } from "drizzle-orm/pg-core";
import {
  GOAL_ACTIONS,
  GOAL_ASSIGNEE_KINDS,
  GOAL_INTERVALS,
  GOAL_METRICS,
  GOAL_SUBJECTS,
} from "@/constants/goals";
import { activityTypes } from "./activityTypes";
import { pipelines } from "./pipelines";

export const goalSubject = pgEnum("goal_subject", GOAL_SUBJECTS);
export const goalAction = pgEnum("goal_action", GOAL_ACTIONS);
export const goalMetric = pgEnum("goal_metric", GOAL_METRICS);
export const goalAssigneeKind = pgEnum("goal_assignee_kind", GOAL_ASSIGNEE_KINDS);
export const goalInterval = pgEnum("goal_interval", GOAL_INTERVALS);

export const goals = pgTable(
  "goals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    subject: goalSubject("subject").notNull(),
    action: goalAction("action").notNull(),
    metric: goalMetric("metric").notNull(),
    assigneeKind: goalAssigneeKind("assignee_kind").notNull(),
    // Null when assigneeKind is 'company'. No FK: it points at users or teams depending on
    // the kind, and a discriminated reference cannot be expressed as one constraint.
    assigneeId: uuid("assignee_id"),
    pipelineId: uuid("pipeline_id").references(() => pipelines.id),
    activityTypeId: uuid("activity_type_id").references(() => activityTypes.id),
    interval: goalInterval("interval").notNull(),
    // Count goals store a whole number here; value goals store money.
    target: numeric("target", { precision: 14, scale: 2 }).notNull(),
    startsOn: date("starts_on").notNull(),
    endsOn: date("ends_on"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [index("goal_assignee_idx").on(t.assigneeKind, t.assigneeId)],
);

export type Goal = typeof goals.$inferSelect;
export type NewGoal = typeof goals.$inferInsert;
