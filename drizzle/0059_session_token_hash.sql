-- Sessions stop being identified by their primary key and start being identified by the sha256
-- of a separate 256-bit cookie token, so that a database read leak or an unencrypted backup no
-- longer hands over live sessions. (The OAuth auth codes and refresh tokens alongside them were
-- already stored hashed; sessions were the inconsistency.)
--
-- Existing rows CANNOT be migrated: the pre-image of the hash is the old cookie value, which by
-- construction is not recoverable from anything stored here, and inventing one would just mint
-- sessions nobody holds. So every current session is dropped. Effect on deploy: everyone signed
-- in is signed out once and logs back in through Google SSO. This is intended, not collateral.
--
-- The DELETE must also precede the ADD COLUMN, since a NOT NULL column with no default cannot be
-- added to a table that has rows.
DELETE FROM "sessions";--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "token_hash" text NOT NULL;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_token_hash_unique" UNIQUE("token_hash");
