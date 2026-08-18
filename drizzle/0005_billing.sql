CREATE TABLE IF NOT EXISTS "billing_docs" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
	"kind" varchar(12) NOT NULL,
	"code" varchar(30) NOT NULL,
	"invoice_ref_id" integer,
	"cust_name" varchar(160),
	"cust_address" text,
	"cust_phone" varchar(40),
	"cust_tax_id" varchar(20),
	"issue_date" date NOT NULL,
	"due_date" date,
	"vat_pct" numeric(5, 2),
	"wht_pct" numeric(5, 2),
	"subtotal" numeric(14, 2) NOT NULL,
	"vat_amount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"wht_amount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"total" numeric(14, 2) NOT NULL,
	"pay_method" varchar(20),
	"pay_date" date,
	"pay_ref" varchar(80),
	"note" text,
	"status" varchar(12) DEFAULT 'ปกติ' NOT NULL,
	"cancel_reason" text,
	"created_by" integer REFERENCES "users"("id"),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "billing_project_idx" ON "billing_docs" ("project_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "billing_kind_idx" ON "billing_docs" ("kind");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "billing_doc_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"doc_id" integer NOT NULL REFERENCES "billing_docs"("id") ON DELETE CASCADE,
	"seq" integer NOT NULL,
	"description" text NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"installment_id" integer
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "billing_items_doc_idx" ON "billing_doc_items" ("doc_id");
