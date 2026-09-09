ALTER TABLE "quotations" ADD COLUMN IF NOT EXISTS "share_token" varchar(24);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "quotations_share_token_idx" ON "quotations" ("share_token");
