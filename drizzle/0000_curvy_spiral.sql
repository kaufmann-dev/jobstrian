CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lead" (
	"id" serial PRIMARY KEY NOT NULL,
	"osm_id" text NOT NULL,
	"name" text NOT NULL,
	"category" text,
	"lat" double precision NOT NULL,
	"lon" double precision NOT NULL,
	"distance_meters" integer NOT NULL,
	"address" text,
	"website" text,
	"phone" text,
	"email" text,
	"email_source" text,
	"has_active_posting" boolean DEFAULT false NOT NULL,
	"rank_score" integer,
	"rank_reason" text,
	"draft_subject" text,
	"draft_body" text,
	"status" text DEFAULT 'new' NOT NULL,
	"first_seen_at" timestamp DEFAULT now() NOT NULL,
	"last_seen_run_id" integer
);
--> statement-breakpoint
CREATE TABLE "listing" (
	"id" serial PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"external_id" text NOT NULL,
	"url" text NOT NULL,
	"title" text NOT NULL,
	"company" text,
	"location" text,
	"description" text,
	"salary" text,
	"posted_at" timestamp,
	"status" text DEFAULT 'active' NOT NULL,
	"first_seen_at" timestamp DEFAULT now() NOT NULL,
	"last_seen_run_id" integer,
	"rank_score" integer,
	"rank_verdict" text,
	"rank_reason" text,
	"ranked_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "scrape_run" (
	"id" serial PRIMARY KEY NOT NULL,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"finished_at" timestamp,
	"status" text DEFAULT 'running' NOT NULL,
	"phase" text DEFAULT 'starting' NOT NULL,
	"counts" jsonb DEFAULT '{"added":0,"closed":0,"ranked":0,"leads":0}'::jsonb NOT NULL,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"profile_text" text DEFAULT '' NOT NULL,
	"role_keywords" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"languages" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"availability" text DEFAULT '' NOT NULL,
	"home_address" text DEFAULT '' NOT NULL,
	"home_lat" double precision,
	"home_lon" double precision,
	"radius_meters" integer DEFAULT 2000 NOT NULL,
	"enabled_sources" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"llm_base_url" text DEFAULT '' NOT NULL,
	"llm_api_key" text DEFAULT '' NOT NULL,
	"llm_model" text DEFAULT '' NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_user_id_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "lead_osm_id_idx" ON "lead" USING btree ("osm_id");--> statement-breakpoint
CREATE INDEX "lead_distance_idx" ON "lead" USING btree ("distance_meters");--> statement-breakpoint
CREATE UNIQUE INDEX "listing_source_external_id_idx" ON "listing" USING btree ("source","external_id");--> statement-breakpoint
CREATE INDEX "listing_status_idx" ON "listing" USING btree ("status");--> statement-breakpoint
CREATE INDEX "listing_rank_score_idx" ON "listing" USING btree ("rank_score");--> statement-breakpoint
CREATE INDEX "session_user_id_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");