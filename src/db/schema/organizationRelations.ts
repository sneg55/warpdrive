// Org-to-org "Related organizations" links (Wave 3, Task 23). Storage is directional
// (sourceOrgId -> targetOrgId, one row per pair) but display is symmetric: listRelatedOrgs
// unions rows where the org is either the source or the target, so a link created from
// org A's page also shows up on org B's page. relationType is a single free-text label
// from the creator's perspective (e.g. "parent", "subsidiary", "partner"); there is no
// separate reverse-direction label.
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
    // CHECK: an org cannot relate to itself. Mirrors the app-level guard in addOrgRelation
    // (which returns a clean Result instead of letting this constraint throw a raw pg error).
    check("organization_relations_no_self_relation", sql`${t.sourceOrgId} <> ${t.targetOrgId}`),
  ],
);

export type OrganizationRelation = typeof organizationRelations.$inferSelect;
export type NewOrganizationRelation = typeof organizationRelations.$inferInsert;
