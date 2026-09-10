CREATE TABLE IF NOT EXISTS "key_findings" (
  "id" serial PRIMARY KEY NOT NULL,
  "meeting_date" date NOT NULL,
  "topic" varchar(160),
  "finding" text NOT NULL,
  "action_plan" text,
  "owner" varchar(120),
  "due_date" date,
  "status" varchar(20) DEFAULT 'ยังไม่เริ่ม' NOT NULL,
  "note" text,
  "created_by" integer REFERENCES "users"("id"),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "kf_status_idx" ON "key_findings" ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "kf_due_idx" ON "key_findings" ("due_date");
