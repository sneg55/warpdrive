CREATE TABLE "brevo_campaigns" (
	"id" bigint PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"subject" text,
	"status" text NOT NULL,
	"sent_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "brevo_contact_campaigns" (
	"email" text NOT NULL,
	"campaign_id" bigint NOT NULL,
	"sent_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"first_opened_at" timestamp with time zone,
	"first_clicked_at" timestamp with time zone,
	"clicked_urls" text[] DEFAULT '{}'::text[] NOT NULL,
	"hard_bounced_at" timestamp with time zone,
	"soft_bounced_at" timestamp with time zone,
	"complained_at" timestamp with time zone,
	"unsubscribed_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "brevo_contact_campaigns_email_campaign_id_pk" PRIMARY KEY("email","campaign_id"),
	CONSTRAINT "brevo_contact_campaigns_email_lowercase" CHECK ("brevo_contact_campaigns"."email" = lower(btrim("brevo_contact_campaigns"."email")))
);
--> statement-breakpoint
CREATE TABLE "brevo_tracked_emails" (
	"email" text PRIMARY KEY NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"covered_through" date,
	"last_refreshed_at" timestamp with time zone,
	"last_attempt_at" timestamp with time zone,
	"not_found_at" timestamp with time zone,
	CONSTRAINT "brevo_tracked_emails_email_lowercase" CHECK ("brevo_tracked_emails"."email" = lower(btrim("brevo_tracked_emails"."email")))
);
