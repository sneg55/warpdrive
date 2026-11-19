import { index, pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { deals } from "./deals";
import { intercomConversations } from "./intercom";
import { persons } from "./persons";

export const dealIntercomSearch = pgTable(
  "deal_intercom_search",
  {
    dealId: uuid("deal_id")
      .notNull()
      .references(() => deals.id, { onDelete: "cascade" }),
    personId: uuid("person_id")
      .notNull()
      .references(() => persons.id, { onDelete: "cascade" }),
    contactId: text("contact_id").notNull(),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => intercomConversations.id, { onDelete: "cascade" }),
    partId: text("part_id").notNull(),
    plainText: text("plain_text").notNull(),
    matchedAt: timestamp("matched_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    primaryKey({
      name: "deal_intercom_search_pk",
      columns: [t.dealId, t.personId, t.contactId, t.conversationId, t.partId],
    }),
    index("deal_intercom_search_deal_idx").on(t.dealId),
    index("deal_intercom_search_conversation_idx").on(t.conversationId),
    index("deal_intercom_search_contact_idx").on(t.contactId),
  ],
);

export type DealIntercomSearchRow = typeof dealIntercomSearch.$inferSelect;
export type NewDealIntercomSearchRow = typeof dealIntercomSearch.$inferInsert;
