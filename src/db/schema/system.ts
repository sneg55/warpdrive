import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { users } from "./identity";

export const labelTargetEnum = pgEnum("label_target", ["deal", "person", "organization", "lead"]);
export const labelColorEnum = pgEnum("label_color", [
  "red",
  "orange",
  "yellow",
  "green",
  "teal",
  "blue",
  "purple",
  "magenta",
  "gray",
]);
export const auditTargetEnum = pgEnum("audit_target", [
  "permission_set",
  "visibility_group",
  "pipeline",
  "user",
  "settings",
  "deal",
  "person",
  "organization",
]);

// Singleton: exactly one row, guarded by CHECK (id = true).
export const settings = pgTable(
  "settings",
  {
    id: boolean("id").primaryKey().default(true),
    baseCurrency: text("base_currency").notNull().default("USD"),
    companyName: text("company_name"),
    defaultPipelineId: uuid("default_pipeline_id"),
    defaultVisibilityLevels: jsonb("default_visibility_levels")
      .notNull()
      .$type<{ deal: string; person: string; organization: string }>()
      .default(sql`'{"deal":"group","person":"all","organization":"all"}'::jsonb`),
    emailTrackingDefaultEnabled: boolean("email_tracking_default_enabled").notNull().default(false),
    bootstrappedAt: timestamp("bootstrapped_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [check("settings_singleton", sql`${t.id} = true`)],
);

export const labels = pgTable("labels", {
  id: uuid("id").defaultRandom().primaryKey(),
  target: labelTargetEnum("target").notNull(),
  name: text("name").notNull(),
  color: labelColorEnum("color").notNull(),
  order: integer("order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// audit_events: security-relevant changes (permission sets, groups, pipeline restriction, user roles).
export const auditEvents = pgTable(
  "audit_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    actorId: uuid("actor_id").references(() => users.id),
    targetType: auditTargetEnum("target_type").notNull(),
    targetId: uuid("target_id"),
    action: text("action").notNull(),
    before: jsonb("before").$type<Record<string, unknown> | null>(),
    after: jsonb("after").$type<Record<string, unknown> | null>(),
    correlationId: uuid("correlation_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("audit_target_idx").on(t.targetType, t.targetId)],
);

export type AuditEvent = typeof auditEvents.$inferSelect;
export type Settings = typeof settings.$inferSelect;
export type Label = typeof labels.$inferSelect;
