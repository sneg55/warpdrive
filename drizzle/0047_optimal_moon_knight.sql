ALTER TABLE "deals" DROP CONSTRAINT "deals_probability_ck";--> statement-breakpoint
ALTER TABLE "stages" DROP CONSTRAINT "stages_probability_ck";--> statement-breakpoint
ALTER TABLE "deals" DROP COLUMN "probability";--> statement-breakpoint
ALTER TABLE "stages" DROP COLUMN "probability";