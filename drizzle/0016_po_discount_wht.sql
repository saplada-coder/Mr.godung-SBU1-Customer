ALTER TABLE "purchase_orders" ADD COLUMN IF NOT EXISTS "discount" numeric(14, 2) DEFAULT '0' NOT NULL;
--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD COLUMN IF NOT EXISTS "wht_pct" numeric(5, 2);
--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD COLUMN IF NOT EXISTS "wht_amount" numeric(14, 2) DEFAULT '0' NOT NULL;
