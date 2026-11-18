import { sql } from "drizzle-orm";
import { check, pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { organizations } from "./organizations";

export const organizationRelations = pgTable(
  "organization_relations",
  {
    sourceOrgId: uuid("source_org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    targetOrgId: uuid("target_org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    relationType: text("relation_type").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.sourceOrgId, t.targetOrgId] }),
    check("organization_relations_no_self_relation", sql`${t.sourceOrgId} <> ${t.targetOrgId}`),
  ],
);

export type OrganizationRelation = typeof organizationRelations.$inferSelect;
export type NewOrganizationRelation = typeof organizationRelations.$inferInsert;
