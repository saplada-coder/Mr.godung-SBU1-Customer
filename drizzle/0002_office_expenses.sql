ALTER TABLE "expenses" ALTER COLUMN "project_id" DROP NOT NULL;
--> statement-breakpoint
ALTER TYPE "public"."cost_cat" ADD VALUE IF NOT EXISTS 'salary';
--> statement-breakpoint
ALTER TYPE "public"."cost_cat" ADD VALUE IF NOT EXISTS 'rent';
--> statement-breakpoint
ALTER TYPE "public"."cost_cat" ADD VALUE IF NOT EXISTS 'utilities';
--> statement-breakpoint
ALTER TYPE "public"."cost_cat" ADD VALUE IF NOT EXISTS 'marketing';
--> statement-breakpoint
ALTER TYPE "public"."cost_cat" ADD VALUE IF NOT EXISTS 'office';
