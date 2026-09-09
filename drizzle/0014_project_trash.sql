ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "deleted_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "deleted_by" integer REFERENCES "users"("id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "projects_deleted_idx" ON "projects" ("deleted_at");
