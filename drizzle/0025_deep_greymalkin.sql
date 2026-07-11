ALTER TABLE "activities" ADD COLUMN "lead_id" uuid;--> statement-breakpoint
ALTER TABLE "email_threads" ADD COLUMN "lead_id" uuid;--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activity_lead_idx" ON "activities" USING btree ("lead_id");--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activity_single_parent" CHECK (num_nonnulls("activities"."deal_id", "activities"."lead_id") <= 1);