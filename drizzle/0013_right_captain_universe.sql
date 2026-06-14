ALTER TABLE "settings" ADD COLUMN "home_location_provider" text;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "home_location_id" text;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "home_postcode" text DEFAULT '' NOT NULL;--> statement-breakpoint
UPDATE "settings"
SET "home_location_provider" = NULL,
	"home_location_id" = NULL,
	"home_postcode" = '',
	"home_city" = '',
	"home_lat" = NULL,
	"home_lon" = NULL;
