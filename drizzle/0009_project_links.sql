CREATE TABLE IF NOT EXISTS "project_links" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
	"title" varchar(160) NOT NULL,
	"url" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" integer REFERENCES "users"("id")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "project_links_project_idx" ON "project_links" ("project_id");
