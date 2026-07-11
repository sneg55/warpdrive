ALTER TABLE "organizations" ADD COLUMN "domain" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "industry" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "employee_count" integer;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "annual_revenue" numeric(14, 2);--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "linkedin_url" text;