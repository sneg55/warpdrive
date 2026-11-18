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

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => "bytea",
});

export const enrichmentProviderEnum = pgEnum("enrichment_provider", ENRICHMENT_PROVIDER_IDS);
export const enrichmentEntityEnum = pgEnum("enrichment_entity", ["person", "organization"]);
export const enrichmentTargetKindEnum = pgEnum("enrichment_target_kind", ["builtin", "custom"]);

export const enrichmentProviders = pgTable("enrichment_providers", {
  provider: enrichmentProviderEnum("provider").primaryKey(),
  enabled: boolean("enabled").notNull().default(false),
  apiKeyEncrypted: bytea("api_key_encrypted"),
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
