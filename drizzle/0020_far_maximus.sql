ALTER TABLE "lead" ADD COLUMN "email_quality_status" text DEFAULT 'unchecked' NOT NULL;--> statement-breakpoint
ALTER TABLE "lead" ADD COLUMN "email_quality_hash" text;--> statement-breakpoint
ALTER TABLE "lead" ADD COLUMN "email_quality_reason" text;--> statement-breakpoint
ALTER TABLE "lead" ADD COLUMN "email_quality_checked_at" timestamp;