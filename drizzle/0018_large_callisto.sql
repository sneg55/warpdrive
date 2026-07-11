CREATE TABLE "leads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"value" numeric(14, 2),
	"person_id" uuid,
	"org_id" uuid,
	"owner_id" uuid NOT NULL,
	"expected_close_date" date,
	"label" text,
	"source_channel" text,
	"source_channel_id" text,
	"source_origin" text DEFAULT 'manually_created' NOT NULL,
	"visibility_level" "visibility_level" NOT NULL,
	"visibility_group_id" uuid,
	"visible_to_user_ids" uuid[] DEFAULT '{}' NOT NULL,
	"last_activity_at" timestamp with time zone,
	"next_activity_at" timestamp with time zone,
	"converted_deal_id" uuid,
	"archived_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_visibility_group_id_visibility_groups_id_fk" FOREIGN KEY ("visibility_group_id") REFERENCES "public"."visibility_groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_converted_deal_id_deals_id_fk" FOREIGN KEY ("converted_deal_id") REFERENCES "public"."deals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "leads_inbox_idx" ON "leads" USING btree ("archived_at","created_at") WHERE deleted_at is null;--> statement-breakpoint
CREATE INDEX "leads_owner_idx" ON "leads" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "leads_visible_to_gin" ON "leads" USING gin ("visible_to_user_ids");--> statement-breakpoint
CREATE INDEX "leads_visibility_group_idx" ON "leads" USING btree ("visibility_group_id") WHERE visibility_level = 'group';