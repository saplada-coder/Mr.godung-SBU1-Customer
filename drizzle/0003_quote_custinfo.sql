ALTER TABLE "quotations" ADD COLUMN IF NOT EXISTS "cust_name" varchar(160);
--> statement-breakpoint
ALTER TABLE "quotations" ADD COLUMN IF NOT EXISTS "cust_address" text;
--> statement-breakpoint
ALTER TABLE "quotations" ADD COLUMN IF NOT EXISTS "cust_phone" varchar(40);
--> statement-breakpoint
ALTER TABLE "quotations" ADD COLUMN IF NOT EXISTS "cust_tax_id" varchar(20);
--> statement-breakpoint
ALTER TABLE "quotations" ADD COLUMN IF NOT EXISTS "portfolio_json" text;
