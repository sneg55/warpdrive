CREATE TYPE "public"."deal_status" AS ENUM('open', 'won', 'lost');--> statement-breakpoint
CREATE TABLE "deal_followers" (
	"deal_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "deal_followers_deal_id_user_id_pk" PRIMARY KEY("deal_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "deal_participants" (
	"deal_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"role" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "deal_participants_deal_id_person_id_pk" PRIMARY KEY("deal_id","person_id")
);
--> statement-breakpoint
CREATE TABLE "deals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"status" "deal_status" DEFAULT 'open' NOT NULL,
	"value" numeric(14, 2),
	"probability" smallint,
	"expected_close_date" date,
	"lost_reason" text,
	"won_time" timestamp with time zone,
	"lost_time" timestamp with time zone,
	"pipeline_id" uuid NOT NULL,
	"stage_id" uuid NOT NULL,
	"board_position" numeric DEFAULT '0' NOT NULL,
	"person_id" uuid,
	"org_id" uuid,
	"owner_id" uuid NOT NULL,
	"visibility_level" "visibility_level" NOT NULL,
	"visibility_group_id" uuid,
	"visible_to_user_ids" uuid[] DEFAULT '{}' NOT NULL,
	"last_activity_at" timestamp with time zone,
	"next_activity_at" timestamp with time zone,
	"stage_entered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"custom_fields" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"search_tsv" "tsvector" GENERATED ALWAYS AS (to_tsvector('simple', coalesce(title, ''))) STORED NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "deals_probability_ck" CHECK (probability is null or probability between 0 and 100),
	CONSTRAINT "deals_group_ck" CHECK (visibility_level <> 'group' OR visibility_group_id IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "deal_followers" ADD CONSTRAINT "deal_followers_deal_id_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal_followers" ADD CONSTRAINT "deal_followers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal_participants" ADD CONSTRAINT "deal_participants_deal_id_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deals" ADD CONSTRAINT "deals_pipeline_id_pipelines_id_fk" FOREIGN KEY ("pipeline_id") REFERENCES "public"."pipelines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deals" ADD CONSTRAINT "deals_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deals" ADD CONSTRAINT "deals_visibility_group_id_visibility_groups_id_fk" FOREIGN KEY ("visibility_group_id") REFERENCES "public"."visibility_groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deals" ADD CONSTRAINT "deals_stage_pipeline_fk" FOREIGN KEY ("stage_id","pipeline_id") REFERENCES "public"."stages"("id","pipeline_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "deal_participants_person_idx" ON "deal_participants" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "deals_board_col_idx" ON "deals" USING btree ("pipeline_id","stage_id","status") WHERE deleted_at is null;--> statement-breakpoint
CREATE INDEX "deals_stage_pos_idx" ON "deals" USING btree ("stage_id","board_position");--> statement-breakpoint
CREATE INDEX "deals_owner_idx" ON "deals" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "deals_person_idx" ON "deals" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "deals_org_idx" ON "deals" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "deals_pipeline_idx" ON "deals" USING btree ("pipeline_id");--> statement-breakpoint
CREATE INDEX "deals_next_activity_idx" ON "deals" USING btree ("next_activity_at");--> statement-breakpoint
CREATE INDEX "deals_close_date_idx" ON "deals" USING btree ("expected_close_date");--> statement-breakpoint
CREATE INDEX "deals_visible_to_gin" ON "deals" USING gin ("visible_to_user_ids");--> statement-breakpoint
CREATE INDEX "deals_visibility_group_idx" ON "deals" USING btree ("visibility_group_id") WHERE visibility_level = 'group';--> statement-breakpoint
CREATE INDEX "deals_custom_fields_gin" ON "deals" USING gin ("custom_fields");--> statement-breakpoint
CREATE INDEX "deals_search_gin" ON "deals" USING gin ("search_tsv");