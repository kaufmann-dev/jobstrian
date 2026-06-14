ALTER TABLE "settings" RENAME COLUMN "role_keywords" TO "job_search_keywords";--> statement-breakpoint
ALTER TABLE "settings" RENAME COLUMN "radius_meters" TO "business_radius_meters";--> statement-breakpoint
ALTER TABLE "settings" ALTER COLUMN "business_radius_meters" SET DEFAULT 5000;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "job_search_locations" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "business_osm_tags" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
UPDATE "settings" SET "business_osm_tags" = '[{"key":"amenity","value":"cafe"},{"key":"amenity","value":"restaurant"},{"key":"amenity","value":"bar"},{"key":"amenity","value":"pub"},{"key":"amenity","value":"fast_food"},{"key":"amenity","value":"biergarten"},{"key":"amenity","value":"ice_cream"},{"key":"amenity","value":"food_court"}]'::jsonb WHERE "business_osm_tags" = '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "settings" DROP COLUMN "work_permit";
