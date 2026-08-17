CREATE TYPE "public"."cost_cat" AS ENUM('material', 'labor', 'subcontract', 'equipment', 'transport', 'other');
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "signature_url" text;
--> statement-breakpoint
ALTER TABLE "activity_log" ADD COLUMN IF NOT EXISTS "quotation_id" integer;
--> statement-breakpoint
ALTER TABLE "activity_log" ADD COLUMN IF NOT EXISTS "project_id" integer;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "activity_quotation_idx" ON "activity_log" ("quotation_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "activity_project_idx" ON "activity_log" ("project_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "company_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"name" varchar(160),
	"address" text,
	"phone" varchar(160),
	"line_id" varchar(60),
	"website" varchar(160),
	"email" varchar(160),
	"tax_id" varchar(20),
	"logo_url" text,
	"bank_personal" text,
	"bank_company" text,
	"warranty_text" text,
	"exclusions_text" text,
	"permit_days" integer,
	"build_days" integer,
	"op_fee_pct" numeric(5, 2),
	"portfolio_json" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" integer REFERENCES "users"("id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "quotations" (
	"id" serial PRIMARY KEY NOT NULL,
	"customer_id" integer NOT NULL REFERENCES "customers"("id") ON DELETE CASCADE,
	"code" varchar(30) NOT NULL,
	"rev" integer DEFAULT 1 NOT NULL,
	"status" varchar(30) DEFAULT 'ร่าง' NOT NULL,
	"issue_date" date NOT NULL,
	"valid_until" date,
	"accepted_at" date,
	"ref_no" varchar(60),
	"op_fee_pct" numeric(5, 2),
	"discount_design" numeric(14, 2),
	"discount_build" numeric(14, 2),
	"vat_pct" numeric(5, 2),
	"permit_days" integer,
	"build_days" integer,
	"exclusions" text,
	"warranty" text,
	"spec" text,
	"note" text,
	"include_portfolio" boolean DEFAULT true NOT NULL,
	"approved_by" integer REFERENCES "users"("id"),
	"approved_at" timestamp with time zone,
	"reject_reason" text,
	"sent_at" date,
	"superseded_by_id" integer,
	"project_id" integer,
	"created_by" integer REFERENCES "users"("id"),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "quotations_customer_idx" ON "quotations" ("customer_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "quotations_status_idx" ON "quotations" ("status");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "quotation_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"quotation_id" integer NOT NULL REFERENCES "quotations"("id") ON DELETE CASCADE,
	"seq" integer NOT NULL,
	"description" text NOT NULL,
	"qty" numeric(12, 2),
	"unit" varchar(30),
	"unit_price" numeric(14, 2),
	"amount" numeric(14, 2) NOT NULL,
	"note" text
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "qitems_quotation_idx" ON "quotation_items" ("quotation_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "quotation_costs" (
	"id" serial PRIMARY KEY NOT NULL,
	"quotation_id" integer NOT NULL REFERENCES "quotations"("id") ON DELETE CASCADE,
	"category" "cost_cat" NOT NULL,
	"amount" numeric(14, 2) NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "qcosts_quotation_idx" ON "quotation_costs" ("quotation_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "quotation_installments" (
	"id" serial PRIMARY KEY NOT NULL,
	"quotation_id" integer NOT NULL REFERENCES "quotations"("id") ON DELETE CASCADE,
	"seq" integer NOT NULL,
	"title" varchar(160) NOT NULL,
	"detail" text,
	"percent" numeric(6, 2),
	"amount" numeric(14, 2) NOT NULL,
	"note" text
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "qinst_quotation_idx" ON "quotation_installments" ("quotation_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "projects" (
	"id" serial PRIMARY KEY NOT NULL,
	"customer_id" integer NOT NULL REFERENCES "customers"("id") ON DELETE CASCADE,
	"quotation_id" integer REFERENCES "quotations"("id"),
	"code" varchar(30) NOT NULL UNIQUE,
	"name" varchar(200) NOT NULL,
	"bu" "bu" NOT NULL,
	"contract_amount" numeric(14, 2) NOT NULL,
	"vat_pct" numeric(5, 2),
	"status" varchar(30) DEFAULT 'กำลังก่อสร้าง' NOT NULL,
	"start_date" date,
	"due_date" date,
	"closed_at" date,
	"closed_by" integer REFERENCES "users"("id"),
	"owner_id" integer REFERENCES "users"("id"),
	"created_by" integer REFERENCES "users"("id"),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "projects_customer_idx" ON "projects" ("customer_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "projects_status_idx" ON "projects" ("status");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "project_budgets" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
	"category" "cost_cat" NOT NULL,
	"amount" numeric(14, 2) NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pbudgets_project_idx" ON "project_budgets" ("project_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "expenses" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
	"category" "cost_cat" NOT NULL,
	"description" text NOT NULL,
	"vendor" varchar(160),
	"amount" numeric(14, 2) NOT NULL,
	"expense_date" date NOT NULL,
	"receipt_url" text,
	"status" varchar(30) DEFAULT 'รออนุมัติ' NOT NULL,
	"approved_by" integer REFERENCES "users"("id"),
	"approved_at" timestamp with time zone,
	"reject_reason" text,
	"created_by" integer REFERENCES "users"("id"),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "expenses_project_idx" ON "expenses" ("project_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "expenses_status_idx" ON "expenses" ("status");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "project_installments" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
	"seq" integer NOT NULL,
	"title" varchar(160) NOT NULL,
	"detail" text,
	"percent" numeric(6, 2),
	"amount" numeric(14, 2) NOT NULL,
	"due_date" date,
	"work_status" varchar(20) DEFAULT 'รอดำเนินการ' NOT NULL,
	"pay_status" varchar(20) DEFAULT 'ยังไม่วางบิล' NOT NULL,
	"paid_at" date,
	"paid_amount" numeric(14, 2),
	"note" text
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pinst_project_idx" ON "project_installments" ("project_id");
--> statement-breakpoint
INSERT INTO "company_settings" ("id") VALUES (1) ON CONFLICT DO NOTHING;
