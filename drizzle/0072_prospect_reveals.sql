CREATE TABLE "prospect_reveals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"batch_id" uuid NOT NULL,
	"org_id" uuid NOT NULL,
	"requested_by" uuid NOT NULL,
	"provider_ref" text NOT NULL,
	"search_provider" "enrichment_provider" NOT NULL,
	"profile" jsonb NOT NULL,
	"outcomes" jsonb NOT NULL,
	"person_id" uuid,
	"applied_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "prospect_reveal_batch_ref_unique" UNIQUE("batch_id","provider_ref")
);
--> statement-breakpoint
ALTER TABLE "prospect_reveals" ADD CONSTRAINT "prospect_reveals_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prospect_reveals" ADD CONSTRAINT "prospect_reveals_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prospect_reveals" ADD CONSTRAINT "prospect_reveals_person_id_persons_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."persons"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "prospect_reveal_org_idx" ON "prospect_reveals" USING btree ("org_id","created_at");