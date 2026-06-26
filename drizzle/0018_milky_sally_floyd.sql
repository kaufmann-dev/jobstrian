CREATE TABLE "application_email" (
	"id" serial PRIMARY KEY NOT NULL,
	"run_id" integer,
	"lead_id" integer NOT NULL,
	"recipient_email" text NOT NULL,
	"lead_name" text NOT NULL,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"scheduled_at" timestamp NOT NULL,
	"sent_at" timestamp,
	"attempts" integer DEFAULT 0 NOT NULL,
	"resend_email_id" text,
	"idempotency_key" text NOT NULL,
	"error" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "application_email_run" (
	"id" serial PRIMARY KEY NOT NULL,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"finished_at" timestamp,
	"status" text DEFAULT 'running' NOT NULL,
	"cancel_requested_at" timestamp,
	"phase" text DEFAULT 'starting' NOT NULL,
	"counts" jsonb DEFAULT '{"queued":0,"sent":0,"failed":0,"skipped":0}'::jsonb NOT NULL,
	"progress" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "application_email_suppression" (
	"email" text PRIMARY KEY NOT NULL,
	"reason" text NOT NULL,
	"source_application_email_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "resend_webhook_event" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "resend_api_key" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "resend_domain" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "resend_domain_id" text;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "resend_domain_status" text DEFAULT 'not_started' NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "resend_dns_records" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "resend_dns_verified_at" timestamp;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "resend_from_local_part" text DEFAULT 'bewerbung' NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "resend_from_name" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "resend_reply_to" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "resend_webhook_secret" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "application_email_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "application_email" ADD CONSTRAINT "application_email_run_id_application_email_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."application_email_run"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_email" ADD CONSTRAINT "application_email_lead_id_lead_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."lead"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_email_suppression" ADD CONSTRAINT "application_email_suppression_source_application_email_id_application_email_id_fk" FOREIGN KEY ("source_application_email_id") REFERENCES "public"."application_email"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "application_email_lead_id_idx" ON "application_email" USING btree ("lead_id");--> statement-breakpoint
CREATE UNIQUE INDEX "application_email_idempotency_key_idx" ON "application_email" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "application_email_status_scheduled_idx" ON "application_email" USING btree ("status","scheduled_at");--> statement-breakpoint
CREATE INDEX "application_email_run_id_idx" ON "application_email" USING btree ("run_id");