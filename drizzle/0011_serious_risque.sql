ALTER TABLE "lead" ADD COLUMN "matched_osm_tags" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "listing" ADD COLUMN "discovery_keyword" text;--> statement-breakpoint
ALTER TABLE "listing" ADD COLUMN "discovery_city" text;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "home_city" text DEFAULT '' NOT NULL;