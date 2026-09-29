-- เอกสารแนบท้ายสัญญา (รูปและไฟล์ PDF) — เก็บเป็น data URL แบบเดียวกับรูปแนบเอกสารการเงิน
CREATE TABLE IF NOT EXISTS "contract_files" (
  "id" serial PRIMARY KEY,
  "contract_id" integer NOT NULL REFERENCES "contracts"("id") ON DELETE CASCADE,
  "name" varchar(200) NOT NULL,
  "mime" varchar(100) NOT NULL,
  "url" text NOT NULL,
  "note" varchar(300),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "created_by" integer REFERENCES "users"("id")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "contract_files_contract_idx" ON "contract_files" ("contract_id");
--> statement-breakpoint
-- ข้อความช่องทางชำระเงินเฉพาะฉบับ — ว่างไว้จะใช้บัญชีบริษัทจากหน้าตั้งค่า
ALTER TABLE "contracts" ADD COLUMN IF NOT EXISTS "pay_to" text;
