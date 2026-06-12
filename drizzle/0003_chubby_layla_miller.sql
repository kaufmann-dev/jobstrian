ALTER TABLE "lead" ADD COLUMN "content_hash" text;--> statement-breakpoint
ALTER TABLE "lead" ADD COLUMN "rank_content_hash" text;--> statement-breakpoint
ALTER TABLE "lead" ADD COLUMN "rank_context_hash" text;--> statement-breakpoint
ALTER TABLE "lead" ADD COLUMN "draft_content_hash" text;--> statement-breakpoint
ALTER TABLE "lead" ADD COLUMN "draft_context_hash" text;--> statement-breakpoint
ALTER TABLE "listing" ADD COLUMN "content_hash" text;--> statement-breakpoint
ALTER TABLE "listing" ADD COLUMN "rank_content_hash" text;--> statement-breakpoint
ALTER TABLE "listing" ADD COLUMN "rank_context_hash" text;--> statement-breakpoint
ALTER TABLE "scrape_run" ADD COLUMN "cancel_requested_at" timestamp;--> statement-breakpoint
ALTER TABLE "scrape_run" ADD COLUMN "progress" jsonb DEFAULT '{}'::jsonb NOT NULL;