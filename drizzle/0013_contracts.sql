CREATE TABLE IF NOT EXISTS "contracts" (
  "id" serial PRIMARY KEY NOT NULL,
  "quotation_id" integer NOT NULL UNIQUE REFERENCES "quotations"("id") ON DELETE CASCADE,
  "customer_id" integer NOT NULL REFERENCES "customers"("id") ON DELETE CASCADE,
  "code" varchar(40) NOT NULL,
  "status" varchar(20) DEFAULT 'ร่าง' NOT NULL,
  "project_name" varchar(200),
  "site_address" text,
  "contractor_signer" varchar(120),
  "contract_amount" numeric(14, 2) NOT NULL,
  "vat_pct" numeric(5, 2),
  "wht_pct" numeric(5, 2),
  "build_days" integer,
  "extend_days" integer,
  "start_within_days" integer,
  "pay_within_days" integer,
  "penalty_per_day" numeric(12, 2),
  "work_hours" varchar(60),
  "warranty_years" integer,
  "building_size" varchar(60),
  "building_sqm" numeric(12, 2),
  "scope_included" text,
  "scope_excluded" text,
  "warranty_text" text,
  "note" text,
  "sign_date" date,
  "due_date" date,
  "created_by" integer REFERENCES "users"("id"),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "contracts_customer_idx" ON "contracts" ("customer_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "contract_installments" (
  "id" serial PRIMARY KEY NOT NULL,
  "contract_id" integer NOT NULL REFERENCES "contracts"("id") ON DELETE CASCADE,
  "seq" integer NOT NULL,
  "title" varchar(200) NOT NULL,
  "amount" numeric(14, 2) NOT NULL,
  "subs_json" text,
  "note" text
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cinst_contract_idx" ON "contract_installments" ("contract_id");
