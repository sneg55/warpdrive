import { index, jsonb, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import type { ProspectProfile, ProviderOutcome } from "@/features/enrichment/providers/types";
import { enrichmentProviderEnum } from "./enrichment";
import { users } from "./identity";
import { organizations } from "./organizations";
import { persons } from "./persons";

export const prospectReveals = pgTable(
  "prospect_reveals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    batchId: uuid("batch_id").notNull(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    requestedBy: uuid("requested_by")
      .notNull()
      .references(() => users.id),
    providerRef: text("provider_ref").notNull(),
    searchProvider: enrichmentProviderEnum("search_provider").notNull(),
    profile: jsonb("profile").$type<ProspectProfile>().notNull(),
    outcomes: jsonb("outcomes").$type<ProviderOutcome[]>().notNull(),
    personId: uuid("person_id").references(() => persons.id, { onDelete: "set null" }),
    appliedAt: timestamp("applied_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("prospect_reveal_batch_ref_unique").on(t.batchId, t.providerRef),
    index("prospect_reveal_org_idx").on(t.orgId, t.createdAt),
  ],
);

export type ProspectRevealRow = typeof prospectReveals.$inferSelect;
export type NewProspectReveal = typeof prospectReveals.$inferInsert;
