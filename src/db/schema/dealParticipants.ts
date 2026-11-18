import { index, pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { deals } from "./deals";

export const dealParticipants = pgTable(
  "deal_participants",
  {
    dealId: uuid("deal_id")
      .notNull()
      .references(() => deals.id, { onDelete: "cascade" }),
    personId: uuid("person_id").notNull(),
    role: text("role"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.dealId, t.personId] }),
    index("deal_participants_person_idx").on(t.personId),
  ],
);

export type DealParticipant = typeof dealParticipants.$inferSelect;
export type NewDealParticipant = typeof dealParticipants.$inferInsert;
