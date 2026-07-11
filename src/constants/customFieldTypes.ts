export const CUSTOM_FIELD_TYPES = [
  "text",
  "large_text",
  "single_option",
  "multi_option",
  "autocomplete",
  "numeric",
  "monetary",
  "user",
  "org",
  "person",
  "phone",
  "time",
  "time_range",
  "date",
  "date_range",
  "address",
] as const;
export type CustomFieldType = (typeof CUSTOM_FIELD_TYPES)[number];

export const CUSTOM_FIELD_TARGETS = ["deal", "person", "organization", "activity"] as const;
export type CustomFieldTarget = (typeof CUSTOM_FIELD_TARGETS)[number];
