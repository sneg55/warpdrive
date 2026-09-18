import type { ComposerContext } from "./composer.types";

// insertFields: resolves deal/person/org field values from the composer context.
// Returns an array of { label, value } pairs for the "Insert field" menu.
// Only includes fields that have a non-empty resolved value so the menu never
// shows blank entries. Inbox context has no deal data, so returns [].

// Named constants for each field label - no magic strings in call sites.
export const INSERT_FIELD_LABELS = {
  DEAL_TITLE: "Deal title",
  DEAL_VALUE: "Deal value",
  FIRST_NAME: "First name",
  LAST_NAME: "Last name",
  CONTACT_EMAIL: "Contact email",
  ORG_NAME: "Organization name",
} as const;

export interface InsertFieldEntry {
  label: string;
  value: string;
  // Entity the field belongs to, drives the Insert-field category tabs (PD parity).
  category?: "Person" | "Deal" | "Organization";
}

export type InsertFieldContext = ComposerContext;

// Build the insert-field catalogue for the given context. Values are already
// resolved client-side from the deal workspace data; no server round-trip needed.
export function insertFields(context: InsertFieldContext): InsertFieldEntry[] {
  if (context.kind !== "deal") return [];

  const candidates: Array<[string, string | undefined, InsertFieldEntry["category"]]> = [
    [INSERT_FIELD_LABELS.DEAL_TITLE, context.dealTitle, "Deal"],
    [INSERT_FIELD_LABELS.DEAL_VALUE, context.dealValue, "Deal"],
    [INSERT_FIELD_LABELS.FIRST_NAME, context.personFirstName, "Person"],
    [INSERT_FIELD_LABELS.LAST_NAME, context.personLastName, "Person"],
    [INSERT_FIELD_LABELS.CONTACT_EMAIL, context.personEmail, "Person"],
    [INSERT_FIELD_LABELS.ORG_NAME, context.orgName, "Organization"],
  ];

  return candidates
    .filter((entry): entry is [string, string, InsertFieldEntry["category"]] => {
      const value = entry[1];
      return value !== undefined && value.length > 0;
    })
    .map(([label, value, category]) => ({ label, value, category }));
}
