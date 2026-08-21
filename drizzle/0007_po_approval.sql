ALTER TABLE "purchase_orders" ADD COLUMN IF NOT EXISTS "approved_by" integer REFERENCES "users"("id");
--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD COLUMN IF NOT EXISTS "approved_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD COLUMN IF NOT EXISTS "reject_reason" text;
--> statement-breakpoint
UPDATE "purchase_orders" SET "status" = 'อนุมัติแล้ว' WHERE "status" = 'ปกติ';
--> statement-breakpoint
ALTER TABLE "purchase_orders" ALTER COLUMN "status" SET DEFAULT 'รออนุมัติ';
--> statement-breakpoint
UPDATE "expenses" SET "status" = 'อนุมัติแล้ว' WHERE "status" = 'รออนุมัติ';
