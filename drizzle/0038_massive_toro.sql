CREATE TABLE "organization_relations" (
	"source_org_id" uuid NOT NULL,
	"target_org_id" uuid NOT NULL,
	"relation_type" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organization_relations_source_org_id_target_org_id_pk" PRIMARY KEY("source_org_id","target_org_id"),
	CONSTRAINT "organization_relations_no_self_relation" CHECK ("organization_relations"."source_org_id" <> "organization_relations"."target_org_id")
);
--> statement-breakpoint
ALTER TABLE "organization_relations" ADD CONSTRAINT "organization_relations_source_org_id_organizations_id_fk" FOREIGN KEY ("source_org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_relations" ADD CONSTRAINT "organization_relations_target_org_id_organizations_id_fk" FOREIGN KEY ("target_org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;