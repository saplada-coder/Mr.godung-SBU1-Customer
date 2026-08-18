CREATE TABLE IF NOT EXISTS "purchase_orders" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer REFERENCES "projects"("id") ON DELETE SET NULL,
	"code" varchar(30) NOT NULL,
	"vendor" varchar(200) NOT NULL,
	"vendor_address" text,
	"vendor_phone" varchar(40),
	"category" "cost_cat",
	"issue_date" date NOT NULL,
	"delivery_date" date,
	"vat_pct" numeric(5, 2),
	"subtotal" numeric(14, 2) NOT NULL,
	"vat_amount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"total" numeric(14, 2) NOT NULL,
	"note" text,
	"status" varchar(12) DEFAULT 'ปกติ' NOT NULL,
	"cancel_reason" text,
	"created_by" integer REFERENCES "users"("id"),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "po_project_idx" ON "purchase_orders" ("project_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "po_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"po_id" integer NOT NULL REFERENCES "purchase_orders"("id") ON DELETE CASCADE,
	"seq" integer NOT NULL,
	"description" text NOT NULL,
	"qty" numeric(12, 2),
	"unit" varchar(30),
	"unit_price" numeric(14, 2),
	"amount" numeric(14, 2) NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "po_items_po_idx" ON "po_items" ("po_id");
