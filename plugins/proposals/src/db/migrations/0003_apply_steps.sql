ALTER TABLE "proposals" ADD COLUMN IF NOT EXISTS "apply_steps" text;
--> statement-breakpoint
ALTER TABLE "proposals" ADD COLUMN IF NOT EXISTS "apply_activity_at" timestamp with time zone;
