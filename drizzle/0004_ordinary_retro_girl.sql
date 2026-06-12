ALTER TABLE "listing" ADD COLUMN "starred" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "llm_requests_per_minute" integer DEFAULT 300 NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "llm_max_concurrent" integer DEFAULT 50 NOT NULL;--> statement-breakpoint
CREATE INDEX "listing_order_idx" ON "listing" USING btree ("starred","rank_score","first_seen_at","id");