ALTER TABLE "quotations" ADD COLUMN IF NOT EXISTS "deleted_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "quotations" ADD COLUMN IF NOT EXISTS "deleted_by" integer REFERENCES "users"("id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "quotations_deleted_idx" ON "quotations" ("deleted_at");
