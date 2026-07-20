DROP INDEX "user_singleton_idx";--> statement-breakpoint
ALTER TABLE "session" ADD COLUMN "last_active_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "session" ADD COLUMN "id_token_hint" text;--> statement-breakpoint
-- Local credential identities do not own Jobstrian data. Remove only Better Auth
-- identity/session state so the first provider-admitted subject creates the new
-- OIDC identity without an implicit email-based account link.
DELETE FROM "verification";--> statement-breakpoint
DELETE FROM "user";--> statement-breakpoint
CREATE UNIQUE INDEX "account_provider_account_unique" ON "account" USING btree ("provider_id","account_id");
