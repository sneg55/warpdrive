import { pgTable, primaryKey, uuid } from "drizzle-orm/pg-core";
import { deals } from "./deals";
import { leads } from "./leads";
import { organizations } from "./organizations";
import { persons } from "./persons";
// labels table + label_target/label_color enums already live in system.ts
// (created in migration 0000). This file adds only the many-to-many join tables.
import { labels } from "./system";

export const dealLabels = pgTable(
  "deal_labels",
  {
    dealId: uuid("deal_id")
      .notNull()
      .references(() => deals.id, { onDelete: "cascade" }),
    labelId: uuid("label_id")
      .notNull()
      .references(() => labels.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.dealId, t.labelId] })],
);

export const personLabels = pgTable(
  "person_labels",
  {
    personId: uuid("person_id")
      .notNull()
      .references(() => persons.id, { onDelete: "cascade" }),
    labelId: uuid("label_id")
      .notNull()
      .references(() => labels.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.personId, t.labelId] })],
);

export const orgLabels = pgTable(
  "org_labels",
  {
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    labelId: uuid("label_id")
      .notNull()
      .references(() => labels.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.orgId, t.labelId] })],
);

export const leadLabels = pgTable(
  "lead_labels",
  {
    leadId: uuid("lead_id")
      .notNull()
      .references(() => leads.id, { onDelete: "cascade" }),
    labelId: uuid("label_id")
      .notNull()
      .references(() => labels.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.leadId, t.labelId] })],
);

export type DealLabel = typeof dealLabels.$inferSelect;
export type PersonLabel = typeof personLabels.$inferSelect;
export type OrgLabel = typeof orgLabels.$inferSelect;
export type LeadLabel = typeof leadLabels.$inferSelect;
