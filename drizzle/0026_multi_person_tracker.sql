-- 1. person: the former single settings row becomes the first person (keeps all data)
ALTER TABLE "settings" RENAME TO "person";
--> statement-breakpoint
ALTER TABLE "person" RENAME CONSTRAINT "settings_pkey" TO "person_pkey";
--> statement-breakpoint
CREATE SEQUENCE "person_id_seq" OWNED BY "person"."id";
--> statement-breakpoint
SELECT setval('person_id_seq', COALESCE((SELECT max("id") FROM "person"), 0) + 1, false);
--> statement-breakpoint
ALTER TABLE "person" ALTER COLUMN "id" SET DEFAULT nextval('person_id_seq');
--> statement-breakpoint
ALTER TABLE "person"
	ADD COLUMN "name" text,
	ADD COLUMN "slug" text,
	ADD COLUMN "color" text DEFAULT 'amber' NOT NULL,
	ADD COLUMN "created_at" timestamp DEFAULT now() NOT NULL,
	ADD COLUMN "llm_model_id" integer;
--> statement-breakpoint
-- Data without a settings row (settings were created lazily) still needs an owner.
INSERT INTO "person" ("name", "slug")
SELECT 'Ich', 'ich'
WHERE NOT EXISTS (SELECT 1 FROM "person")
	AND (EXISTS (SELECT 1 FROM "listing") OR EXISTS (SELECT 1 FROM "lead") OR EXISTS (SELECT 1 FROM "cv")
		OR EXISTS (SELECT 1 FROM "scrape_run") OR EXISTS (SELECT 1 FROM "application_email_run")
		OR EXISTS (SELECT 1 FROM "application_email_suppression"));
--> statement-breakpoint
UPDATE "person"
SET "name" = COALESCE(NULLIF(btrim("full_name"), ''), 'Ich')
WHERE "name" IS NULL;
--> statement-breakpoint
UPDATE "person"
SET "slug" = COALESCE(
	NULLIF(btrim(regexp_replace(lower(translate("name", 'äöüÄÖÜß', 'aouaous')), '[^a-z0-9]+', '-', 'g'), '-'), ''),
	'person-' || "id"
)
WHERE "slug" IS NULL;
--> statement-breakpoint
ALTER TABLE "person" ALTER COLUMN "name" SET NOT NULL, ALTER COLUMN "slug" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "person" ADD CONSTRAINT "person_name_unique" UNIQUE("name"), ADD CONSTRAINT "person_slug_unique" UNIQUE("slug");
--> statement-breakpoint
-- 2. LLM connections and models (shared by all people)
CREATE TABLE "app_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"default_llm_model_id" integer,
	"ghost_after_days" integer DEFAULT 21 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "llm_connection" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"base_url" text NOT NULL,
	"api_key" text DEFAULT '' NOT NULL,
	"requests_per_minute" integer DEFAULT 300 NOT NULL,
	"max_concurrent" integer DEFAULT 50 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "llm_connection_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "llm_model" (
	"id" serial PRIMARY KEY NOT NULL,
	"connection_id" integer NOT NULL,
	"model_id" text NOT NULL,
	"verified" boolean DEFAULT false NOT NULL,
	"verified_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
INSERT INTO "llm_connection" ("name", "base_url", "api_key", "requests_per_minute", "max_concurrent")
SELECT 'Standard', "llm_base_url", "llm_api_key", "llm_requests_per_minute", "llm_max_concurrent"
FROM "person"
WHERE "llm_base_url" <> ''
ORDER BY "id"
LIMIT 1;
--> statement-breakpoint
INSERT INTO "llm_model" ("connection_id", "model_id", "verified", "verified_at")
SELECT (SELECT "id" FROM "llm_connection" ORDER BY "id" LIMIT 1), "llm_model", "llm_verified", "llm_verified_at"
FROM "person"
WHERE "llm_base_url" <> '' AND "llm_model" <> ''
ORDER BY "id"
LIMIT 1;
--> statement-breakpoint
INSERT INTO "app_settings" ("id", "default_llm_model_id")
VALUES (1, (SELECT "id" FROM "llm_model" ORDER BY "id" LIMIT 1));
--> statement-breakpoint
ALTER TABLE "person"
	DROP COLUMN "llm_base_url",
	DROP COLUMN "llm_api_key",
	DROP COLUMN "llm_model",
	DROP COLUMN "llm_requests_per_minute",
	DROP COLUMN "llm_max_concurrent",
	DROP COLUMN "llm_verified",
	DROP COLUMN "llm_verified_at";
--> statement-breakpoint
-- 3. Scope existing rows to the first person
ALTER TABLE "scrape_run" ADD COLUMN "person_id" integer;
--> statement-breakpoint
UPDATE "scrape_run" SET "person_id" = (SELECT min("id") FROM "person");
--> statement-breakpoint
ALTER TABLE "scrape_run" ALTER COLUMN "person_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "listing" ADD COLUMN "person_id" integer;
--> statement-breakpoint
UPDATE "listing" SET "person_id" = (SELECT min("id") FROM "person");
--> statement-breakpoint
ALTER TABLE "listing" ALTER COLUMN "person_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "lead" ADD COLUMN "person_id" integer;
--> statement-breakpoint
UPDATE "lead" SET "person_id" = (SELECT min("id") FROM "person");
--> statement-breakpoint
ALTER TABLE "lead" ALTER COLUMN "person_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "application_email_run" ADD COLUMN "person_id" integer;
--> statement-breakpoint
UPDATE "application_email_run" SET "person_id" = (SELECT min("id") FROM "person");
--> statement-breakpoint
ALTER TABLE "application_email_run" ALTER COLUMN "person_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "application_email_suppression" ADD COLUMN "person_id" integer;
--> statement-breakpoint
UPDATE "application_email_suppression" SET "person_id" = (SELECT min("id") FROM "person");
--> statement-breakpoint
ALTER TABLE "application_email_suppression" ALTER COLUMN "person_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "application_email" ADD COLUMN "person_id" integer;
--> statement-breakpoint
UPDATE "application_email" ae SET "person_id" = l."person_id" FROM "lead" l WHERE l."id" = ae."lead_id";
--> statement-breakpoint
ALTER TABLE "application_email" ALTER COLUMN "person_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "cv" ADD COLUMN "person_id" integer;
--> statement-breakpoint
UPDATE "cv" SET "person_id" = (SELECT min("id") FROM "person");
--> statement-breakpoint
ALTER TABLE "cv" DROP CONSTRAINT "cv_pkey";
--> statement-breakpoint
ALTER TABLE "cv" DROP COLUMN "id";
--> statement-breakpoint
ALTER TABLE "cv" ADD PRIMARY KEY ("person_id");
--> statement-breakpoint
ALTER TABLE "application_email_suppression" DROP CONSTRAINT "application_email_suppression_pkey";
--> statement-breakpoint
ALTER TABLE "application_email_suppression" ADD CONSTRAINT "application_email_suppression_person_id_email_pk" PRIMARY KEY("person_id","email");
--> statement-breakpoint
-- 4. Application tracker
CREATE TABLE "application" (
	"id" serial PRIMARY KEY NOT NULL,
	"person_id" integer NOT NULL,
	"search_id" integer NOT NULL,
	"company_name" text NOT NULL,
	"position_title" text DEFAULT '' NOT NULL,
	"url" text DEFAULT '' NOT NULL,
	"location" text DEFAULT '' NOT NULL,
	"contact_name" text DEFAULT '' NOT NULL,
	"contact_email" text DEFAULT '' NOT NULL,
	"contact_phone" text DEFAULT '' NOT NULL,
	"channel" text DEFAULT 'email' NOT NULL,
	"status" text DEFAULT 'applied' NOT NULL,
	"applied_on" date,
	"responded_at" timestamp,
	"next_step_on" date,
	"next_step_note" text DEFAULT '' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"listing_id" integer,
	"lead_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "application_event" (
	"id" serial PRIMARY KEY NOT NULL,
	"application_id" integer NOT NULL,
	"kind" text NOT NULL,
	"status" text,
	"note" text DEFAULT '' NOT NULL,
	"occurred_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "application_search" (
	"id" serial PRIMARY KEY NOT NULL,
	"person_id" integer NOT NULL,
	"title" text NOT NULL,
	"goal" text DEFAULT '' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'searching' NOT NULL,
	"started_on" date NOT NULL,
	"ended_on" date,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
-- 5. Constraints and indexes
DROP INDEX "lead_osm_id_idx";
--> statement-breakpoint
DROP INDEX "listing_source_external_id_idx";
--> statement-breakpoint
DROP INDEX "lead_order_idx";
--> statement-breakpoint
DROP INDEX "listing_order_idx";
--> statement-breakpoint
ALTER TABLE "app_settings" ADD CONSTRAINT "app_settings_default_llm_model_id_llm_model_id_fk" FOREIGN KEY ("default_llm_model_id") REFERENCES "public"."llm_model"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "application" ADD CONSTRAINT "application_person_id_person_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."person"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "application" ADD CONSTRAINT "application_search_id_application_search_id_fk" FOREIGN KEY ("search_id") REFERENCES "public"."application_search"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "application" ADD CONSTRAINT "application_listing_id_listing_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listing"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "application" ADD CONSTRAINT "application_lead_id_lead_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."lead"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "application_event" ADD CONSTRAINT "application_event_application_id_application_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."application"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "application_search" ADD CONSTRAINT "application_search_person_id_person_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."person"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "llm_model" ADD CONSTRAINT "llm_model_connection_id_llm_connection_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."llm_connection"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "person" ADD CONSTRAINT "person_llm_model_id_llm_model_id_fk" FOREIGN KEY ("llm_model_id") REFERENCES "public"."llm_model"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "application_email" ADD CONSTRAINT "application_email_person_id_person_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."person"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "application_email_run" ADD CONSTRAINT "application_email_run_person_id_person_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."person"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "application_email_suppression" ADD CONSTRAINT "application_email_suppression_person_id_person_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."person"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "cv" ADD CONSTRAINT "cv_person_id_person_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."person"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "lead" ADD CONSTRAINT "lead_person_id_person_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."person"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "listing" ADD CONSTRAINT "listing_person_id_person_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."person"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "scrape_run" ADD CONSTRAINT "scrape_run_person_id_person_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."person"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "application_search_idx" ON "application" USING btree ("search_id");
--> statement-breakpoint
CREATE INDEX "application_person_status_idx" ON "application" USING btree ("person_id","status");
--> statement-breakpoint
CREATE UNIQUE INDEX "application_lead_idx" ON "application" USING btree ("lead_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "application_listing_idx" ON "application" USING btree ("listing_id");
--> statement-breakpoint
CREATE INDEX "application_event_application_idx" ON "application_event" USING btree ("application_id","occurred_at");
--> statement-breakpoint
CREATE INDEX "application_search_person_idx" ON "application_search" USING btree ("person_id","started_on" DESC NULLS LAST);
--> statement-breakpoint
CREATE UNIQUE INDEX "application_search_one_active_idx" ON "application_search" USING btree ("person_id") WHERE "application_search"."status" = 'searching';
--> statement-breakpoint
CREATE UNIQUE INDEX "llm_model_connection_model_idx" ON "llm_model" USING btree ("connection_id","model_id");
--> statement-breakpoint
CREATE INDEX "application_email_person_idx" ON "application_email" USING btree ("person_id");
--> statement-breakpoint
CREATE INDEX "application_email_run_person_idx" ON "application_email_run" USING btree ("person_id","id" DESC NULLS LAST);
--> statement-breakpoint
CREATE UNIQUE INDEX "lead_person_osm_id_idx" ON "lead" USING btree ("person_id","osm_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "listing_person_source_external_id_idx" ON "listing" USING btree ("person_id","source","external_id");
--> statement-breakpoint
CREATE INDEX "scrape_run_person_idx" ON "scrape_run" USING btree ("person_id","id" DESC NULLS LAST);
--> statement-breakpoint
CREATE INDEX "lead_order_idx" ON "lead" USING btree ("person_id","starred" DESC NULLS LAST,"rank_score" DESC NULLS LAST,"distance_meters","id");
--> statement-breakpoint
CREATE INDEX "listing_order_idx" ON "listing" USING btree ("person_id","starred" DESC NULLS LAST,"rank_score" DESC NULLS LAST,"first_seen_at" DESC NULLS LAST,"id" DESC NULLS LAST);
