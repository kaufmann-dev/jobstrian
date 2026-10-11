ALTER TABLE "llm_connection" ADD COLUMN "api_type" text;--> statement-breakpoint
UPDATE "llm_connection"
SET "api_type" = CASE
  WHEN "base_url" ~* '^https?://api[.]openai[.]com(:[0-9]+)?(/|$)' THEN 'openai'
  WHEN "base_url" ~* '^https?://api[.]anthropic[.]com(:[0-9]+)?(/|$)' THEN 'anthropic'
  ELSE 'openai-compatible'
END;--> statement-breakpoint
UPDATE "llm_model" SET "verified" = false, "verified_at" = NULL
WHERE "connection_id" IN (SELECT "id" FROM "llm_connection" WHERE "api_type" IN ('openai', 'anthropic'));--> statement-breakpoint
ALTER TABLE "llm_connection" ALTER COLUMN "api_type" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "llm_connection" ADD CONSTRAINT "llm_connection_api_type_check" CHECK ("llm_connection"."api_type" in ('openai', 'anthropic', 'openai-compatible'));