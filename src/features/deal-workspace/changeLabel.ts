// Change-log row -> display label. Split out of historyTimeline.ts, which owns the shape of the
// feed rather than the wording of an individual audit row.
import {
  CHANGE_FIELD_CUSTOM_PREFIX,
  CHANGE_FIELD_FOLLOWER,
  CHANGE_FIELD_ORG,
  CHANGE_FIELD_PARTICIPANT,
  CHANGE_FIELD_PERSON,
  CHANGE_FIELD_STATUS,
  CHANGE_LABEL_CUSTOM_FIELD,
  CHANGE_LABEL_FOLLOWER_ADDED,
  CHANGE_LABEL_FOLLOWER_REMOVED,
  CHANGE_LABEL_ORG_CHANGED,
  CHANGE_LABEL_ORG_LINKED,
  CHANGE_LABEL_ORG_UNLINKED,
  CHANGE_LABEL_PARTICIPANT_ADDED,
  CHANGE_LABEL_PARTICIPANT_REMOVED,
  CHANGE_LABEL_PERSON_CHANGED,
  CHANGE_LABEL_PERSON_LINKED,
  CHANGE_LABEL_PERSON_UNLINKED,
} from "@/constants/changeLogFields";
import { ENRICHMENT_STRINGS } from "@/constants/enrichmentStrings";
import { isSourceChannelKey, SOURCE_CHANNELS } from "@/constants/sourceChannels";
import { canonicalField } from "@/features/enrichment/canonical";
import { asLostStatusValue } from "./lostStatusValue";

// Format a jsonb audit value for display; null/empty read as "(none)".
export function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "(none)";
  if (typeof value === "string") return value.length === 0 ? "(none)" : value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

// Field-aware value formatting: resolve label-key arrays and source-channel keys to display names.
function formatFieldValue(field: string, value: unknown): string {
  if (field === "labels") {
    if (!Array.isArray(value) || value.length === 0) return "(none)";
    // Stored label values are the catalog display names, so render them directly.
    return value.map((k) => String(k)).join(", ");
  }
  if (field === "source_channel" || field === "sourceChannel") {
    if (typeof value === "string" && isSourceChannelKey(value)) return SOURCE_CHANNELS[value].name;
  }
  return formatValue(value);
}

// Enrichment logs the applied value together with the providers that backed it. Anything that
// is not exactly that shape (a legacy row, a hand-written payload) falls back to the plain diff.
interface EnrichedValue {
  value: unknown;
  providers: string[];
}
function asEnrichedValue(value: unknown): EnrichedValue | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (!("value" in record) || !Array.isArray(record.providers)) return null;
  return {
    value: record.value,
    providers: record.providers.filter((p): p is string => typeof p === "string"),
  };
}

const PROVIDER_NAMES: Readonly<Record<string, string>> = ENRICHMENT_STRINGS.settings.providerNames;

// "apollo" -> "Apollo"; an id no longer in the roster renders as itself rather than vanishing.
function provenanceClause(providers: string[]): string {
  const names = providers.map((p) => PROVIDER_NAMES[p] ?? p);
  const last = names.at(-1);
  if (last === undefined) return "";
  const list = names.length === 1 ? last : `${names.slice(0, -1).join(", ")} and ${last}`;
  return ` (from ${list})`;
}

// "expected_close_date" -> "Expected close date". Enrichment writes the dotted canonical key
// (org.industry), which the shared vocabulary already carries a label for. Custom-field edits
// carry a dynamic def key under a prefix (custom_field:region); collapse them all to one generic
// "Custom field" label since the read layer does not resolve the def name here.
function humanizeField(field: string): string {
  if (field.startsWith(CHANGE_FIELD_CUSTOM_PREFIX)) return CHANGE_LABEL_CUSTOM_FIELD;
  const canonical = canonicalField(field);
  if (canonical !== undefined) return canonical.label;
  const spaced = field.replace(/_/g, " ").trim();
  if (spaced.length === 0) return field;
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

// Direction of a link change, inferred from which side is null: null->id = link/add,
// id->null = unlink/remove, id->id = change.
type LinkDir = "add" | "remove" | "change";
function linkDir(oldValue: unknown, newValue: unknown): LinkDir {
  const had = oldValue !== null && oldValue !== undefined;
  const has = newValue !== null && newValue !== undefined;
  if (!had) return "add";
  if (!has) return "remove";
  return "change";
}

// Directional phrasing per link field (the stored value is an opaque id we deliberately do
// not surface). Participants/followers only ever add or remove, so "change" reuses "add".
const PERSON_DIR: Record<LinkDir, string> = {
  add: CHANGE_LABEL_PERSON_LINKED,
  remove: CHANGE_LABEL_PERSON_UNLINKED,
  change: CHANGE_LABEL_PERSON_CHANGED,
};
const ORG_DIR: Record<LinkDir, string> = {
  add: CHANGE_LABEL_ORG_LINKED,
  remove: CHANGE_LABEL_ORG_UNLINKED,
  change: CHANGE_LABEL_ORG_CHANGED,
};
const PARTICIPANT_DIR: Record<LinkDir, string> = {
  add: CHANGE_LABEL_PARTICIPANT_ADDED,
  remove: CHANGE_LABEL_PARTICIPANT_REMOVED,
  change: CHANGE_LABEL_PARTICIPANT_ADDED,
};
const FOLLOWER_DIR: Record<LinkDir, string> = {
  add: CHANGE_LABEL_FOLLOWER_ADDED,
  remove: CHANGE_LABEL_FOLLOWER_REMOVED,
  change: CHANGE_LABEL_FOLLOWER_ADDED,
};
const DIRECTIONAL_FIELDS: Record<string, Record<LinkDir, string>> = {
  [CHANGE_FIELD_PERSON]: PERSON_DIR,
  [CHANGE_FIELD_ORG]: ORG_DIR,
  [CHANGE_FIELD_PARTICIPANT]: PARTICIPANT_DIR,
  [CHANGE_FIELD_FOLLOWER]: FOLLOWER_DIR,
};

// Returns a directional phrase for the link fields, or null so the caller falls back to the
// "field: old → new" diff form for every other field.
function directionalLabel(field: string, oldValue: unknown, newValue: unknown): string | null {
  const dir = DIRECTIONAL_FIELDS[field];
  if (dir === undefined) return null;
  return dir[linkDir(oldValue, newValue)];
}

// "Status: open → lost · Bad timing · my bad", matching the reason chip in the deal header.
// Returns null for any row that is not a lost transition carrying a reason or comment.
function lostStatusLabel(field: string, oldValue: unknown, newValue: unknown): string | null {
  if (field !== CHANGE_FIELD_STATUS) return null;
  const lost = asLostStatusValue(newValue);
  if (lost === null) return null;
  const suffix = [lost.reason, lost.comment].filter((s): s is string => s !== null).join(" · ");
  const head = `${humanizeField(field)}: ${formatValue(oldValue)} → ${lost.value}`;
  return suffix === "" ? head : `${head} · ${suffix}`;
}

export function formatChangeLabel(entry: {
  field: string;
  oldValue: unknown;
  newValue: unknown;
}): string {
  const lost = lostStatusLabel(entry.field, entry.oldValue, entry.newValue);
  if (lost !== null) return lost;
  const directional = directionalLabel(entry.field, entry.oldValue, entry.newValue);
  if (directional !== null) return directional;
  const enriched = asEnrichedValue(entry.newValue);
  const newValue = enriched === null ? entry.newValue : enriched.value;
  const provenance = enriched === null ? "" : provenanceClause(enriched.providers);
  return `${humanizeField(entry.field)}: ${formatFieldValue(entry.field, entry.oldValue)} → ${formatFieldValue(entry.field, newValue)}${provenance}`;
}
