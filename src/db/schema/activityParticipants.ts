import { index, pgTable, primaryKey, text, uuid } from "drizzle-orm/pg-core";
import { activities } from "./activities";
import { users } from "./identity";

export const activityParticipants = pgTable(
  "activity_participants",
  {
    activityId: uuid("activity_id")
      .notNull()
      .references(() => activities.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role"),
  },
  (t) => [
    primaryKey({ columns: [t.activityId, t.userId] }),
    index("activity_participant_user_idx").on(t.userId),
  ],
);

export type ActivityParticipant = typeof activityParticipants.$inferSelect;
