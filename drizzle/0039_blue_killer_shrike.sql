CREATE TABLE "contact_followers" (
	"entity_type" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contact_followers_entity_type_entity_id_user_id_pk" PRIMARY KEY("entity_type","entity_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "contact_followers" ADD CONSTRAINT "contact_followers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;