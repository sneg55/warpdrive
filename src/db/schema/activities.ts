import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { activityTypes } from "./activityTypes";
import { deals } from "./deals";
import { users } from "./identity";
import { leads } from "./leads";
import { organizations } from "./organizations";
import { persons } from "./persons";

export const activities = pgTable(
  "activities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    typeId: uuid("type_id")
      .notNull()
      .references(() => activityTypes.id),
    subject: text("subject").notNull(),
    dueAt: timestamp("due_at", { withTimezone: true }),
    allDay: boolean("all_day").notNull().default(false),
    endAt: timestamp("end_at", { withTimezone: true }),
    durationMinutes: integer("duration_minutes"),
    priority: text("priority"),
    done: boolean("done").notNull().default(false),
    doneAt: timestamp("done_at", { withTimezone: true }),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id),
    assigneeId: uuid("assignee_id")
      .notNull()
      .references(() => users.id),
    dealId: uuid("deal_id").references(() => deals.id),
    leadId: uuid("lead_id").references(() => leads.id),
    personId: uuid("person_id").references(() => persons.id),
    orgId: uuid("org_id").references(() => organizations.id),
    customFields: jsonb("custom_fields").notNull().default(sql`'{}'::jsonb`),
    location: text("location"),
    note: text("note"),
    notePlain: text("note_plain").generatedAlwaysAs(sql`search_plain_text(note)`),
    videoCallUrl: text("video_call_url"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    index("activity_assignee_idx").on(t.assigneeId, t.done, t.dueAt),
    index("activity_deal_idx").on(t.dealId),
    index("activity_lead_idx").on(t.leadId),
    index("activity_person_idx").on(t.personId),
    index("activity_org_idx").on(t.orgId),
    index("activity_reminder_idx").on(t.dueAt).where(sql`done = false`),
    check("activity_single_parent", sql`num_nonnulls(${t.dealId}, ${t.leadId}) <= 1`),
  ],
);

export type Activity = typeof activities.$inferSelect;
export type NewActivity = typeof activities.$inferInsert;
