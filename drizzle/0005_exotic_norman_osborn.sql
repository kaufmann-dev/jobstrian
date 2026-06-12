DROP INDEX "listing_order_idx";--> statement-breakpoint
CREATE INDEX "lead_order_idx" ON "lead" USING btree ("rank_score" DESC NULLS LAST,"distance_meters","id");--> statement-breakpoint
CREATE INDEX "listing_order_idx" ON "listing" USING btree ("starred" DESC NULLS LAST,"rank_score" DESC NULLS LAST,"first_seen_at" DESC NULLS LAST,"id" DESC NULLS LAST);