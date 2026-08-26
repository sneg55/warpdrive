CREATE TYPE "public"."enrichment_entity" AS ENUM('person', 'organization');--> statement-breakpoint
CREATE TYPE "public"."enrichment_provider" AS ENUM('apollo', 'rocketreach', 'getprospect');--> statement-breakpoint
CREATE TYPE "public"."enrichment_target_kind" AS ENUM('builtin', 'custom');--> statement-breakpoint
CREATE TABLE "enrichment_field_mappings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity" "enrichment_entity" NOT NULL,
	"canonical_key" text NOT NULL,
	"target_kind" "enrichment_target_kind" NOT NULL,
	"target_key" text,
	"target_field_def_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "enrichment_mapping_key_unique" UNIQUE("entity","canonical_key"),
	CONSTRAINT "enrichment_mapping_target" CHECK (("enrichment_field_mappings"."target_kind" = 'builtin' AND "enrichment_field_mappings"."target_key" IS NOT NULL AND "enrichment_field_mappings"."target_field_def_id" IS NULL)
       OR ("enrichment_field_mappings"."target_kind" = 'custom' AND "enrichment_field_mappings"."target_field_def_id" IS NOT NULL AND "enrichment_field_mappings"."target_key" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "enrichment_providers" (
	"provider" "enrichment_provider" PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"api_key_encrypted" "bytea",
	"api_key_hint" text,
	"throttled_until" timestamp with time zone,
	"throttle_reason" text,
	"needs_attention" boolean DEFAULT false NOT NULL,
	"last_ok_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "enrichment_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_type" "enrichment_entity" NOT NULL,
	"entity_id" uuid NOT NULL,
	"requested_by" uuid NOT NULL,
	"outcomes" jsonb NOT NULL,
	"applied_fields" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"applied_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "enrichment_settings" (
	"id" boolean PRIMARY KEY DEFAULT true NOT NULL,
	"cache_ttl_days" integer DEFAULT 30 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "enrichment_settings_singleton" CHECK ("enrichment_settings"."id" = true)
);
--> statement-breakpoint
ALTER TABLE "enrichment_field_mappings" ADD CONSTRAINT "enrichment_field_mappings_target_field_def_id_custom_field_defs_id_fk" FOREIGN KEY ("target_field_def_id") REFERENCES "public"."custom_field_defs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrichment_runs" ADD CONSTRAINT "enrichment_runs_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "enrichment_run_entity_idx" ON "enrichment_runs" USING btree ("entity_type","entity_id","created_at");
-- Default field mappings. Seeded here rather than at runtime so a fresh install enriches
-- organizations out of the box; a migration runs once, so a mapping an admin later clears
-- stays cleared. Built-ins only: a custom field has to exist before it can be a target.
INSERT INTO "enrichment_field_mappings" ("entity", "canonical_key", "target_kind", "target_key") VALUES
  ('organization', 'org.domain', 'builtin', 'domain'),
  ('organization', 'org.industry', 'builtin', 'industry'),
  ('organization', 'org.employeeCount', 'builtin', 'employeeCount'),
  ('organization', 'org.annualRevenue', 'builtin', 'annualRevenue'),
  ('organization', 'org.linkedinUrl', 'builtin', 'linkedinUrl'),
  ('organization', 'org.street', 'builtin', 'address.street'),
  ('organization', 'org.city', 'builtin', 'address.city'),
  ('organization', 'org.state', 'builtin', 'address.region'),
  ('organization', 'org.postalCode', 'builtin', 'address.postal'),
  ('organization', 'org.country', 'builtin', 'address.country'),
  ('person', 'person.email', 'builtin', 'emails'),
  ('person', 'person.companyName', 'builtin', 'org')
ON CONFLICT ("entity", "canonical_key") DO NOTHING;
