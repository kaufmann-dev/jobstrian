DROP INDEX "lead_order_idx";--> statement-breakpoint
ALTER TABLE "lead" ADD COLUMN "starred" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX "lead_order_idx" ON "lead" USING btree ("starred" DESC NULLS LAST,"rank_score" DESC NULLS LAST,"distance_meters","id");