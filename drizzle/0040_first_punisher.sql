ALTER TYPE "public"."import_status" ADD VALUE 'uploaded';--> statement-breakpoint
ALTER TYPE "public"."import_status" ADD VALUE 'parsing';--> statement-breakpoint
ALTER TYPE "public"."import_status" ADD VALUE 'mapping_ready';--> statement-breakpoint
ALTER TYPE "public"."import_status" ADD VALUE 'undoing';--> statement-breakpoint
ALTER TYPE "public"."import_status" ADD VALUE 'undone';--> statement-breakpoint
ALTER TABLE "import_batches" ADD COLUMN "processed_rows" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "import_batches" ADD COLUMN "headers" jsonb;--> statement-breakpoint
ALTER TABLE "import_batches" ADD COLUMN "preview_rows" jsonb;--> statement-breakpoint
ALTER TABLE "import_batches" ADD COLUMN "undone_at" timestamp with time zone;