import type { PgColumn, PgTable } from "drizzle-orm/pg-core";
import type { LabelTarget } from "@/constants/labelColors";
import { dealLabels, leadLabels, orgLabels, personLabels } from "@/db/schema/labels";

// Dispatch a label target to its join table + the (entity id, label id) columns, so the entity
// read/write helpers and the usage counter can operate uniformly over deal/person/org/lead.
export interface LabelJoin {
  table: PgTable;
  entityCol: PgColumn;
  labelCol: PgColumn;
}

export function labelJoin(target: LabelTarget): LabelJoin {
  switch (target) {
    case "deal":
      return { table: dealLabels, entityCol: dealLabels.dealId, labelCol: dealLabels.labelId };
    case "person":
      return {
        table: personLabels,
        entityCol: personLabels.personId,
        labelCol: personLabels.labelId,
      };
    case "organization":
      return { table: orgLabels, entityCol: orgLabels.orgId, labelCol: orgLabels.labelId };
    case "lead":
      return { table: leadLabels, entityCol: leadLabels.leadId, labelCol: leadLabels.labelId };
  }
}

export const ALL_LABEL_JOINS: LabelJoin[] = [
  labelJoin("deal"),
  labelJoin("person"),
  labelJoin("organization"),
  labelJoin("lead"),
];
