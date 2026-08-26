import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  customType,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import type { ProviderOutcome } from "@/features/enrichment/providers/types";
import { ENRICHMENT_PROVIDER_IDS } from "@/features/enrichment/providers/types";
import { customFieldDefs } from "./customFieldDefs";
import { users } from "./identity";

// bytea for the encrypted API key, same pattern and same AES-256-GCM packing as Gmail tokens.
const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => "bytea",
});

export const enrichmentProviderEnum = pgEnum("enrichment_provider", ENRICHMENT_PROVIDER_IDS);
export const enrichmentEntityEnum = pgEnum("enrichment_entity", ["person", "organization"]);
export const enrichmentTargetKindEnum = pgEnum("enrichment_target_kind", ["builtin", "custom"]);

// One row per provider. `enabled` is the admin's toggle and is independent of whether a key is
// stored, so a provider can be switched off without losing its credential and back on without
// re-pasting it. `throttled_until` is the runtime's, written from a 429 or a credit exhaustion and
// cleared by the passage of time; the runtime never touches `enabled`.
export const enrichmentProviders = pgTable("enrichment_providers", {
  provider: enrichmentProviderEnum("provider").primaryKey(),
  enabled: boolean("enabled").notNull().default(false),
  apiKeyEncrypted: bytea("api_key_encrypted"),
  // Last four characters, so the settings page can show "…a91f" without ever decrypting.
  apiKeyHint: text("api_key_hint"),
  throttledUntil: timestamp("throttled_until", { withTimezone: true }),
  throttleReason: text("throttle_reason"),
  needsAttention: boolean("needs_attention").notNull().default(false),
  lastOkAt: timestamp("last_ok_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

// Singleton, same shape as the existing settings table.
export const enrichmentSettings = pgTable(
  "enrichment_settings",
  {
    id: boolean("id").primaryKey().default(true),
    cacheTtlDays: integer("cache_ttl_days").notNull().default(30),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [check("enrichment_settings_singleton", sql`${t.id} = true`)],
);

export const enrichmentFieldMappings = pgTable(
  "enrichment_field_mappings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    entity: enrichmentEntityEnum("entity").notNull(),
    canonicalKey: text("canonical_key").notNull(),
    targetKind: enrichmentTargetKindEnum("target_kind").notNull(),
    targetKey: text("target_key"),
    // Cascade: deleting a custom field def removes the mapping that pointed at it, so a mapping
    // can never dangle and silently write into nothing.
    targetFieldDefId: uuid("target_field_def_id").references(() => customFieldDefs.id, {
      onDelete: "cascade",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    unique("enrichment_mapping_key_unique").on(t.entity, t.canonicalKey),
    // One target, one canonical key. The application checks this too, but two admins saving at once
    // both pass that check before either row is visible, and the planner writes one patch key per
    // target, so the loser would still be reported as applied and written to the change log.
    uniqueIndex("enrichment_mapping_builtin_target_unique")
      .on(t.entity, t.targetKey)
      .where(sql`${t.targetKind} = 'builtin'`),
    uniqueIndex("enrichment_mapping_custom_target_unique")
      .on(t.entity, t.targetFieldDefId)
      .where(sql`${t.targetKind} = 'custom'`),
    check(
      "enrichment_mapping_target",
      sql`(${t.targetKind} = 'builtin' AND ${t.targetKey} IS NOT NULL AND ${t.targetFieldDefId} IS NULL)
       OR (${t.targetKind} = 'custom' AND ${t.targetFieldDefId} IS NOT NULL AND ${t.targetKey} IS NULL)`,
    ),
  ],
);

// `outcomes` holds the NORMALISED candidate, never the raw provider payload: a raw body carries
// more personal data than we intend to keep, and nothing downstream reads anything but canonical
// keys.
export const enrichmentRuns = pgTable(
  "enrichment_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    entityType: enrichmentEntityEnum("entity_type").notNull(),
    entityId: uuid("entity_id").notNull(),
    requestedBy: uuid("requested_by")
      .notNull()
      .references(() => users.id),
    outcomes: jsonb("outcomes").$type<ProviderOutcome[]>().notNull(),
    // The lookup identity the providers were asked about. Nullable for rows written before the
    // column existed; those are never reused, since their identity cannot be proved.
    lookupFingerprint: text("lookup_fingerprint"),
    appliedFields: jsonb("applied_fields").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    appliedAt: timestamp("applied_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("enrichment_run_entity_idx").on(t.entityType, t.entityId, t.createdAt)],
);

export type EnrichmentProviderRow = typeof enrichmentProviders.$inferSelect;
export type EnrichmentFieldMappingRow = typeof enrichmentFieldMappings.$inferSelect;
export type EnrichmentRunRow = typeof enrichmentRuns.$inferSelect;
export type NewEnrichmentRun = typeof enrichmentRuns.$inferInsert;
