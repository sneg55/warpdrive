ALTER TYPE "public"."custom_field_target" ADD VALUE 'lead' BEFORE 'person';--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "custom_fields" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
CREATE INDEX "leads_cf_idx" ON "leads" USING gin ("custom_fields");