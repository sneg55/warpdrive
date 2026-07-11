CREATE TYPE "public"."custom_field_target" AS ENUM('deal', 'person', 'organization', 'activity');--> statement-breakpoint
CREATE TYPE "public"."custom_field_type" AS ENUM('text', 'large_text', 'single_option', 'multi_option', 'autocomplete', 'numeric', 'monetary', 'user', 'org', 'person', 'phone', 'time', 'time_range', 'date', 'date_range', 'address');--> statement-breakpoint
CREATE TABLE "custom_field_defs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"target_entity" "custom_field_target" NOT NULL,
	"type" "custom_field_type" NOT NULL,
	"name" text NOT NULL,
	"key" text NOT NULL,
	"options" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_required" boolean DEFAULT false NOT NULL,
	"order" integer DEFAULT 0 NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cf_def_target_key_unique" UNIQUE("target_entity","key")
);
--> statement-breakpoint
CREATE TABLE "deal_labels" (
	"deal_id" uuid NOT NULL,
	"label_id" uuid NOT NULL,
	CONSTRAINT "deal_labels_deal_id_label_id_pk" PRIMARY KEY("deal_id","label_id")
);
--> statement-breakpoint
CREATE TABLE "org_labels" (
	"org_id" uuid NOT NULL,
	"label_id" uuid NOT NULL,
	CONSTRAINT "org_labels_org_id_label_id_pk" PRIMARY KEY("org_id","label_id")
);
--> statement-breakpoint
CREATE TABLE "person_labels" (
	"person_id" uuid NOT NULL,
	"label_id" uuid NOT NULL,
	CONSTRAINT "person_labels_person_id_label_id_pk" PRIMARY KEY("person_id","label_id")
);
--> statement-breakpoint
ALTER TABLE "deal_labels" ADD CONSTRAINT "deal_labels_deal_id_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal_labels" ADD CONSTRAINT "deal_labels_label_id_labels_id_fk" FOREIGN KEY ("label_id") REFERENCES "public"."labels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_labels" ADD CONSTRAINT "org_labels_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_labels" ADD CONSTRAINT "org_labels_label_id_labels_id_fk" FOREIGN KEY ("label_id") REFERENCES "public"."labels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person_labels" ADD CONSTRAINT "person_labels_person_id_persons_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."persons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person_labels" ADD CONSTRAINT "person_labels_label_id_labels_id_fk" FOREIGN KEY ("label_id") REFERENCES "public"."labels"("id") ON DELETE cascade ON UPDATE no action;