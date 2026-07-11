CREATE TABLE "activities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type_id" uuid NOT NULL,
	"subject" text NOT NULL,
	"due_at" timestamp with time zone,
	"duration_minutes" integer,
	"done" boolean DEFAULT false NOT NULL,
	"done_at" timestamp with time zone,
	"owner_id" uuid NOT NULL,
	"assignee_id" uuid NOT NULL,
	"deal_id" uuid,
	"person_id" uuid,
	"org_id" uuid,
	"custom_fields" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "activity_guests" (
	"activity_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	CONSTRAINT "activity_guests_activity_id_person_id_pk" PRIMARY KEY("activity_id","person_id")
);
--> statement-breakpoint
CREATE TABLE "activity_participants" (
	"activity_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text,
	CONSTRAINT "activity_participants_activity_id_user_id_pk" PRIMARY KEY("activity_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "activity_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"icon" text,
	"is_system" boolean DEFAULT false NOT NULL,
	"order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "activity_types_key_unique" UNIQUE("key")
);
--> statement-breakpoint
INSERT INTO "activity_types" ("key", "name", "icon", "is_system", "order") VALUES
	('call', 'Call', 'phone', true, 0),
	('meeting', 'Meeting', 'users', true, 1),
	('task', 'Task', 'check', true, 2),
	('deadline', 'Deadline', 'flag', true, 3),
	('email', 'Email', 'mail', true, 4),
	('lunch', 'Lunch', 'utensils', true, 5);
--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_type_id_activity_types_id_fk" FOREIGN KEY ("type_id") REFERENCES "public"."activity_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_assignee_id_users_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_deal_id_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_person_id_persons_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."persons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_guests" ADD CONSTRAINT "activity_guests_activity_id_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_guests" ADD CONSTRAINT "activity_guests_person_id_persons_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."persons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_participants" ADD CONSTRAINT "activity_participants_activity_id_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_participants" ADD CONSTRAINT "activity_participants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activity_assignee_idx" ON "activities" USING btree ("assignee_id","done","due_at");--> statement-breakpoint
CREATE INDEX "activity_deal_idx" ON "activities" USING btree ("deal_id");--> statement-breakpoint
CREATE INDEX "activity_person_idx" ON "activities" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "activity_org_idx" ON "activities" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "activity_reminder_idx" ON "activities" USING btree ("due_at") WHERE done = false;--> statement-breakpoint
CREATE INDEX "activity_participant_user_idx" ON "activity_participants" USING btree ("user_id");