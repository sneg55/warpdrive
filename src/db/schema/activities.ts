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
    // Multi-day parity (Pipedrive): an explicit end timestamp for activities that span
    // more than a single day. Null for same-day activities (their span, if any, is the
    // start/end time captured as durationMinutes). Ordering (endAt >= dueAt) is enforced
    // in the create/update repo, not by a DB check, so a bad payload returns an AppError.
    endAt: timestamp("end_at", { withTimezone: true }),
    durationMinutes: integer("duration_minutes"),
    // Optional priority (Pipedrive Low/Medium/High); null = unset. Key resolved to name+color in UI.
    priority: text("priority"),
    done: boolean("done").notNull().default(false),
    doneAt: timestamp("done_at", { withTimezone: true }),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id),
    assigneeId: uuid("assignee_id")
      .notNull()
      .references(() => users.id),
    // Nullable links: an activity may attach to a deal, person, and/or org.
    dealId: uuid("deal_id").references(() => deals.id),
    // A lead-scoped activity (Leads Inbox timeline). Mutually exclusive with dealId
    // (a row links at most one primary parent), enforced by the check below.
    leadId: uuid("lead_id").references(() => leads.id),
    personId: uuid("person_id").references(() => persons.id),
    orgId: uuid("org_id").references(() => organizations.id),
    customFields: jsonb("custom_fields").notNull().default(sql`'{}'::jsonb`),
    // Pipedrive parity: free-text location and a rich-text note (sanitized HTML).
    location: text("location"),
    note: text("note"),
    // Pipedrive parity (B3): a generated token-based video-call link (plain URL string; no
    // external Meet/Zoom OAuth). Null when the activity has no video call.
    videoCallUrl: text("video_call_url"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    // Index: assignee's to-do list, sorted by completion + due date.
    index("activity_assignee_idx").on(t.assigneeId, t.done, t.dueAt),
    // Index: FK lookups by linked record.
    index("activity_deal_idx").on(t.dealId),
    index("activity_lead_idx").on(t.leadId),
    index("activity_person_idx").on(t.personId),
    index("activity_org_idx").on(t.orgId),
    // Partial: due reminders only consider open (not-done) activities.
    index("activity_reminder_idx").on(t.dueAt).where(sql`done = false`),
    // A row links at most one primary parent (deal XOR lead, or neither).
    check("activity_single_parent", sql`num_nonnulls(${t.dealId}, ${t.leadId}) <= 1`),
  ],
);

export type Activity = typeof activities.$inferSelect;
export type NewActivity = typeof activities.$inferInsert;
