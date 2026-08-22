CREATE TABLE IF NOT EXISTS "billing_doc_images" (
	"id" serial PRIMARY KEY NOT NULL,
	"doc_id" integer NOT NULL REFERENCES "billing_docs"("id") ON DELETE CASCADE,
	"url" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" integer REFERENCES "users"("id")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "billing_images_doc_idx" ON "billing_doc_images" ("doc_id");
