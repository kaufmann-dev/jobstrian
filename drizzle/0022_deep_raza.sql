ALTER TABLE "settings" ADD COLUMN "llm_verified" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "llm_verified_at" timestamp;