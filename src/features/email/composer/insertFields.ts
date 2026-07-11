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
}

// Extended deal context that carries resolved person/org values for the insert menu.
// These come from data the deal page already has client-side; no extra fetch needed.
export type InsertFieldContext =
  | { kind: "inbox"; threadId?: string }
  | {
      kind: "deal";
      dealId: string;
      dealTitle?: string;
      dealValue?: string;
      personFirstName?: string;
      personLastName?: string;
      personEmail?: string;
      orgName?: string;
      // Remaining ComposerContext fields passed through transparently
      defaultTo?: string;
      personId?: string;
      orgId?: string;
    };

// Build the insert-field catalogue for the given context. Values are already
// resolved client-side from the deal workspace data; no server round-trip needed.
export function insertFields(context: InsertFieldContext): InsertFieldEntry[] {
  if (context.kind === "inbox") return [];

  const candidates: Array<[string, string | undefined]> = [
    [INSERT_FIELD_LABELS.DEAL_TITLE, context.dealTitle],
    [INSERT_FIELD_LABELS.DEAL_VALUE, context.dealValue],
    [INSERT_FIELD_LABELS.FIRST_NAME, context.personFirstName],
    [INSERT_FIELD_LABELS.LAST_NAME, context.personLastName],
    [INSERT_FIELD_LABELS.CONTACT_EMAIL, context.personEmail],
    [INSERT_FIELD_LABELS.ORG_NAME, context.orgName],
  ];

  return candidates
    .filter((entry): entry is [string, string] => {
      const value = entry[1];
      return value !== undefined && value.length > 0;
    })
    .map(([label, value]) => ({ label, value }));
}
