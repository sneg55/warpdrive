CREATE TYPE "public"."goal_action" AS ENUM('added', 'won', 'lost', 'completed');--> statement-breakpoint
CREATE TYPE "public"."goal_assignee_kind" AS ENUM('user', 'team', 'company');--> statement-breakpoint
CREATE TYPE "public"."goal_interval" AS ENUM('weekly', 'monthly', 'quarterly', 'yearly');--> statement-breakpoint
CREATE TYPE "public"."goal_metric" AS ENUM('count', 'value');--> statement-breakpoint
CREATE TYPE "public"."goal_subject" AS ENUM('deal', 'activity');--> statement-breakpoint
CREATE TABLE "goals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subject" "goal_subject" NOT NULL,
	"action" "goal_action" NOT NULL,
	"metric" "goal_metric" NOT NULL,
	"assignee_kind" "goal_assignee_kind" NOT NULL,
	"assignee_id" uuid,
	"pipeline_id" uuid,
	"activity_type_id" uuid,
	"interval" "goal_interval" NOT NULL,
	"target" numeric(14, 2) NOT NULL,
	"starts_on" date NOT NULL,
	"ends_on" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "goals" ADD CONSTRAINT "goals_pipeline_id_pipelines_id_fk" FOREIGN KEY ("pipeline_id") REFERENCES "public"."pipelines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goals" ADD CONSTRAINT "goals_activity_type_id_activity_types_id_fk" FOREIGN KEY ("activity_type_id") REFERENCES "public"."activity_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "goal_assignee_idx" ON "goals" USING btree ("assignee_kind","assignee_id");