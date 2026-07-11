import { pgTable, primaryKey, timestamp, uuid } from "drizzle-orm/pg-core";
import { deals } from "./deals";
import { users } from "./identity";

export const dealFollowers = pgTable(
  "deal_followers",
  {
    dealId: uuid("deal_id")
      .notNull()
      .references(() => deals.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.dealId, t.userId] })],
);

export type DealFollower = typeof dealFollowers.$inferSelect;
export type NewDealFollower = typeof dealFollowers.$inferInsert;
