-- สัญญาออกแบบ: สัญญาชนิดที่สองที่ร่างจากใบเสนอราคาเดียวกันได้ (ค่าออกแบบ 10% ของมูลค่าโครงการ)
ALTER TABLE "contracts" ADD COLUMN IF NOT EXISTS "kind" varchar(20) NOT NULL DEFAULT 'ก่อสร้าง';
--> statement-breakpoint
-- มูลค่าโครงการที่ใช้คิดค่าออกแบบ (snapshot จากใบเสนอราคาตอนร่าง) + อัตราค่าออกแบบ
ALTER TABLE "contracts" ADD COLUMN IF NOT EXISTS "project_value" numeric(14,2);
--> statement-breakpoint
ALTER TABLE "contracts" ADD COLUMN IF NOT EXISTS "fee_pct" numeric(5,2);
--> statement-breakpoint
ALTER TABLE "contracts" ADD COLUMN IF NOT EXISTS "design_revisions" integer;
--> statement-breakpoint
ALTER TABLE "contracts" ADD COLUMN IF NOT EXISTS "credit_to_build" boolean NOT NULL DEFAULT false;
--> statement-breakpoint
-- ใบเสนอราคาหนึ่งใบมีได้ทั้งสัญญาออกแบบและสัญญาก่อสร้าง จึงเลิก unique ที่ quotation_id เดี่ยว ๆ
ALTER TABLE "contracts" DROP CONSTRAINT IF EXISTS "contracts_quotation_id_key";
--> statement-breakpoint
ALTER TABLE "contracts" DROP CONSTRAINT IF EXISTS "contracts_quotation_id_unique";
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "contracts_quote_kind_uq" ON "contracts" ("quotation_id","kind");
