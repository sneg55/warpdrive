export interface SearchIndexDef {
  name: string;
  table: string;
  expression: string;
  where?: string;
}

const NORMALISED_DOMAIN =
  "split_part(regexp_replace(lower(coalesce(domain, '')), '^(https?://)?(www\\.)?', ''), '/', 1)";

const CUSTOM_FIELD_TABLES = ["deals", "persons", "leads", "organizations", "activities"] as const;

export const LEGACY_SEARCH_INDEX_NAMES: readonly string[] = [
  "notes_body_plain_trgm",
  "activities_note_plain_trgm",
  "email_messages_body_html_plain_trgm",
];

export const SEARCH_INDEXES: readonly SearchIndexDef[] = [
  { name: "deals_title_trgm", table: "deals", expression: "title" },
  { name: "leads_title_trgm", table: "leads", expression: "title" },
  { name: "persons_name_trgm", table: "persons", expression: "name" },
  { name: "persons_primary_email_trgm", table: "persons", expression: "(primary_email::text)" },
  { name: "organizations_name_trgm", table: "organizations", expression: "name" },
  { name: "organizations_domain_trgm", table: "organizations", expression: NORMALISED_DOMAIN },
  {
    name: "notes_body_plain_col_trgm",
    table: "notes",
    expression: "body_plain",
    where: "deleted_at IS NULL",
  },
  { name: "comments_body_trgm", table: "comments", expression: "body" },
  { name: "activities_subject_trgm", table: "activities", expression: "subject" },
  {
    name: "activities_note_plain_col_trgm",
    table: "activities",
    expression: "note_plain",
  },
  { name: "email_threads_subject_trgm", table: "email_threads", expression: "subject" },
  { name: "email_messages_subject_trgm", table: "email_messages", expression: "subject" },
  { name: "email_messages_body_text_trgm", table: "email_messages", expression: "body_text" },
  {
    name: "email_messages_body_html_plain_col_trgm",
    table: "email_messages",
    expression: "body_html_plain",
  },
  { name: "email_messages_from_name_trgm", table: "email_messages", expression: "from_name" },
  {
    name: "email_messages_from_email_trgm",
    table: "email_messages",
    expression: "(from_email::text)",
  },
  ...CUSTOM_FIELD_TABLES.map((table) => ({
    name: `${table}_custom_fields_trgm`,
    table,
    expression: "(custom_fields::text)",
  })),
  {
    name: "deal_intercom_search_plain_trgm",
    table: "deal_intercom_search",
    expression: "plain_text",
  },
  {
    name: "files_filename_trgm",
    table: "files",
    expression: "filename",
    where: "status = 'ready'",
  },
];
