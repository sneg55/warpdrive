// Origin tag shown on every deal-history row (Pipedrive's "(Web App)" attribution).
// Single origin today; a nullable `source` column arrives when a second origin
// (Gmail sync, automation) actually exists. Kept as a named constant, not a magic string.
export const SOURCE_WEB_APP = "Web App";

// Neutral fallback for an unresolved actor (a since-deleted user or a
// system-originated change with a null actor_id). Never leak an email or "null".
export const ACTOR_UNKNOWN = "Someone";
