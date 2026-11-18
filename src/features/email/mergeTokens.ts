export interface MergeTokenField {
  label: string;
  token: string;
}

export const MERGE_TOKEN_FIELDS: readonly MergeTokenField[] = [
  { label: "First name", token: "person.first_name" },
  { label: "Last name", token: "person.last_name" },
  { label: "Full name", token: "person.name" },
  { label: "Contact email", token: "person.email" },
  { label: "Deal title", token: "deal.title" },
  { label: "Deal value", token: "deal.value" },
  { label: "Organization name", token: "org.name" },
];

export function mergeTokenPlaceholder(token: string): string {
  return `{{${token}}}`;
}
