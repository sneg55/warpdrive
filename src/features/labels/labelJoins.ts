import type { PgColumn, PgTable } from "drizzle-orm/pg-core";
import type { LabelTarget } from "@/constants/labelColors";
import { deals } from "@/db/schema/deals";
import { dealLabels, leadLabels, orgLabels, personLabels } from "@/db/schema/labels";
import { leads } from "@/db/schema/leads";
import { organizations } from "@/db/schema/organizations";
import { persons } from "@/db/schema/persons";

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

export interface LabelArraySource {
  table: PgTable;
  labelsCol: PgColumn;
  idCol: PgColumn;
}

export function labelArraySource(target: LabelTarget): LabelArraySource {
  switch (target) {
    case "deal":
      return { table: deals, labelsCol: deals.labels, idCol: deals.id };
    case "person":
      return { table: persons, labelsCol: persons.labels, idCol: persons.id };
    case "organization":
      return { table: organizations, labelsCol: organizations.labels, idCol: organizations.id };
    case "lead":
      return { table: leads, labelsCol: leads.labels, idCol: leads.id };
  }
}
