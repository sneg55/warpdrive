import { pgTable, primaryKey, uuid } from "drizzle-orm/pg-core";
import { activities } from "./activities";
import { persons } from "./persons";

export const activityGuests = pgTable(
  "activity_guests",
  {
    activityId: uuid("activity_id")
      .notNull()
      .references(() => activities.id, { onDelete: "cascade" }),
    personId: uuid("person_id")
      .notNull()
      .references(() => persons.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.activityId, t.personId] })],
);

export type ActivityGuest = typeof activityGuests.$inferSelect;
