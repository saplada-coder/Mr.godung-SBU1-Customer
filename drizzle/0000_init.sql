CREATE TYPE "public"."appt_type" AS ENUM('zoom', 'site');--> statement-breakpoint
CREATE TYPE "public"."bu" AS ENUM('BU1', 'BU2', 'BU3', 'BU4', 'BU5', 'BU6', 'BU7');--> statement-breakpoint
CREATE TYPE "public"."channel" AS ENUM('FB : Mr.โกดัง', 'Line OA', 'โทร', 'MD', 'อื่นๆ');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('admin', 'sales', 'viewer');--> statement-breakpoint
CREATE TABLE "activity_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"customer_id" integer,
	"user_id" integer,
	"action" varchar(40) NOT NULL,
	"field" varchar(40),
	"old_value" text,
	"new_value" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "appointments" (
	"id" serial PRIMARY KEY NOT NULL,
	"customer_id" integer NOT NULL,
	"type" "appt_type" NOT NULL,
	"appt_date" date NOT NULL,
	"appt_time" varchar(5),
	"note" text,
	"done" boolean DEFAULT false NOT NULL,
	"reminded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" integer
);
--> statement-breakpoint
CREATE TABLE "attachments" (
	"id" serial PRIMARY KEY NOT NULL,
	"customer_id" integer NOT NULL,
	"kind" varchar(10) NOT NULL,
	"name" varchar(200) NOT NULL,
	"url" text NOT NULL,
	"mime" varchar(100),
	"size_bytes" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" integer
);
--> statement-breakpoint
CREATE TABLE "bu_rates" (
	"bu" "bu" PRIMARY KEY NOT NULL,
	"rate_per_sqm" integer NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" integer
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" varchar(40) NOT NULL,
	"bu" "bu" NOT NULL,
	"name" varchar(120),
	"channel" "channel",
	"chname" varchar(120),
	"phone" varchar(20),
	"province" varchar(60),
	"detail" text,
	"cat" varchar(60),
	"width_m" numeric(8, 2),
	"length_m" numeric(8, 2),
	"height_m" numeric(8, 2),
	"sqm" numeric(12, 2),
	"amount_est" numeric(14, 2),
	"amount_actual" numeric(14, 2),
	"status" varchar(60) DEFAULT 'ลูกค้าใหม่ – รอติดต่อ' NOT NULL,
	"quote_status" varchar(60) DEFAULT 'ยังไม่ทำใบเสนอราคา' NOT NULL,
	"inquired_at" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"owner_id" integer,
	CONSTRAINT "customers_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "notes" (
	"id" serial PRIMARY KEY NOT NULL,
	"customer_id" integer NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" integer
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" varchar(190) NOT NULL,
	"name" varchar(120),
	"image" text,
	"role" "role" DEFAULT 'viewer' NOT NULL,
	"bu" "bu",
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "activity_log" ADD CONSTRAINT "activity_log_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_log" ADD CONSTRAINT "activity_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bu_rates" ADD CONSTRAINT "bu_rates_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activity_customer_idx" ON "activity_log" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "appointments_date_idx" ON "appointments" USING btree ("appt_date");--> statement-breakpoint
CREATE INDEX "appointments_customer_idx" ON "appointments" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "attachments_customer_idx" ON "attachments" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "customers_bu_idx" ON "customers" USING btree ("bu");--> statement-breakpoint
CREATE INDEX "customers_status_idx" ON "customers" USING btree ("status");--> statement-breakpoint
CREATE INDEX "customers_quote_status_idx" ON "customers" USING btree ("quote_status");--> statement-breakpoint
CREATE INDEX "customers_inquired_at_idx" ON "customers" USING btree ("inquired_at");--> statement-breakpoint
CREATE INDEX "notes_customer_idx" ON "notes" USING btree ("customer_id");