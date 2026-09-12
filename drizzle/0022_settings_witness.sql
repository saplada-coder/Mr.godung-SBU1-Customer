ALTER TABLE "company_settings" ADD COLUMN IF NOT EXISTS "witness_name" varchar(120);
--> statement-breakpoint
UPDATE "company_settings" SET "signer_name" = 'นายวิเจน แก้วมณี' WHERE "id" = 1 AND ("signer_name" IS NULL OR "signer_name" = '');
--> statement-breakpoint
UPDATE "company_settings" SET "witness_name" = 'นางสาวซัลวาณี ลีวาเมาะ' WHERE "id" = 1 AND ("witness_name" IS NULL OR "witness_name" = '');
