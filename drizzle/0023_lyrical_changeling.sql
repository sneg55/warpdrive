ALTER TABLE "deals" ADD COLUMN "labels" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "labels" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
UPDATE "deals" SET "labels" = CASE WHEN "label" IS NULL THEN '{}' ELSE ARRAY["label"] END;--> statement-breakpoint
UPDATE "leads" SET "labels" = CASE WHEN "label" IS NULL THEN '{}' ELSE ARRAY["label"] END;--> statement-breakpoint
UPDATE "deals" SET "source_channel" = NULL WHERE "source_channel" IS NOT NULL AND "source_channel" NOT IN ('outbound','inbound','referral','web_form','chatbot','campaign','social','event','advertising','other');--> statement-breakpoint
UPDATE "leads" SET "source_channel" = NULL WHERE "source_channel" IS NOT NULL AND "source_channel" NOT IN ('outbound','inbound','referral','web_form','chatbot','campaign','social','event','advertising','other');
