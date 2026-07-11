CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"address" jsonb,
	"owner_id" uuid NOT NULL,
	"visibility_level" "visibility_level" NOT NULL,
	"visibility_group_id" uuid,
	"visible_to_user_ids" uuid[] DEFAULT '{}' NOT NULL,
	"custom_fields" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"search_tsv" "tsvector" GENERATED ALWAYS AS (to_tsvector('simple', coalesce(name, ''))) STORED NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "org_group_required" CHECK (visibility_level <> 'group' OR visibility_group_id IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "persons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"primary_email" "citext",
	"emails" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"phones" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"org_id" uuid,
	"owner_id" uuid NOT NULL,
	"visibility_level" "visibility_level" NOT NULL,
	"visibility_group_id" uuid,
	"visible_to_user_ids" uuid[] DEFAULT '{}' NOT NULL,
	"custom_fields" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"search_tsv" "tsvector" GENERATED ALWAYS AS (setweight(to_tsvector('simple', coalesce(name, '')), 'A') || setweight(to_tsvector('simple', coalesce(primary_email::text, '')), 'B')) STORED NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "person_group_required" CHECK (visibility_level <> 'group' OR visibility_group_id IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_visibility_group_id_visibility_groups_id_fk" FOREIGN KEY ("visibility_group_id") REFERENCES "public"."visibility_groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "persons" ADD CONSTRAINT "persons_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "persons" ADD CONSTRAINT "persons_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "persons" ADD CONSTRAINT "persons_visibility_group_id_visibility_groups_id_fk" FOREIGN KEY ("visibility_group_id") REFERENCES "public"."visibility_groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "org_owner_idx" ON "organizations" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "org_cf_idx" ON "organizations" USING gin ("custom_fields");--> statement-breakpoint
CREATE INDEX "org_search_idx" ON "organizations" USING gin ("search_tsv");--> statement-breakpoint
CREATE INDEX "org_visible_idx" ON "organizations" USING gin ("visible_to_user_ids");--> statement-breakpoint
CREATE INDEX "org_group_idx" ON "organizations" USING btree ("visibility_group_id") WHERE visibility_level = 'group';--> statement-breakpoint
CREATE INDEX "person_email_idx" ON "persons" USING btree ("primary_email");--> statement-breakpoint
CREATE INDEX "person_org_idx" ON "persons" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "person_owner_idx" ON "persons" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "person_cf_idx" ON "persons" USING gin ("custom_fields");--> statement-breakpoint
CREATE INDEX "person_search_idx" ON "persons" USING gin ("search_tsv");--> statement-breakpoint
CREATE INDEX "person_visible_idx" ON "persons" USING gin ("visible_to_user_ids");--> statement-breakpoint
CREATE INDEX "person_group_idx" ON "persons" USING btree ("visibility_group_id") WHERE visibility_level = 'group';