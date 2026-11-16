CREATE TABLE "x_account_chat_keys" (
	"account_id" uuid NOT NULL,
	"key_version" text NOT NULL,
	"keys_enc" "bytea" NOT NULL,
	"unlocked_at" timestamp with time zone NOT NULL,
	"unlocked_by_user_id" uuid,
	CONSTRAINT "x_account_chat_keys_account_id_key_version_pk" PRIMARY KEY("account_id","key_version")
);
--> statement-breakpoint
ALTER TABLE "x_accounts" ADD COLUMN "chat_latest_key_version" text;--> statement-breakpoint
ALTER TABLE "x_accounts" ADD COLUMN "chat_keys_broken_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "x_conversations" ADD COLUMN "backfilled_key_version" text;--> statement-breakpoint
ALTER TABLE "x_account_chat_keys" ADD CONSTRAINT "x_account_chat_keys_account_id_x_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."x_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "x_account_chat_keys" ADD CONSTRAINT "x_account_chat_keys_unlocked_by_user_id_users_id_fk" FOREIGN KEY ("unlocked_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;